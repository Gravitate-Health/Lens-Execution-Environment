import {
  IPS,
  PreprocessedEPI,
  Lens,
  LensExecutionResult,
  ExecutionOptions,
  FocusingError,
  ApplyLensesResult,
  FHIRResource,
  FHIRSection,
  LensExecutionObject,
} from './types';

/**
 * @security IMPORTANT: This module executes lens code using `new Function()`.
 * Lens code is trusted content that should only come from verified sources.
 * The lenses are expected to be FHIR Library resources from the Gravitate Health
 * ecosystem. Do not execute untrusted or user-provided lens code.
 */

/**
 * Gets the lens identifier from a Lens resource.
 *
 * @param lens - The lens resource
 * @returns The lens identifier value
 */
export function getLensIdentifier(lens: Lens): string {
  return lens.identifier?.[0]?.value || lens.id || 'unknown-lens';
}

/**
 * Extracts the lens code from a Lens resource.
 * The code is stored as base64-encoded data in the content array.
 *
 * @param lens - The lens resource
 * @returns The decoded lens code string, or empty string if not found
 */
export function extractLensCode(lens: Lens): string {
  try {
    const lensBase64data = lens.content?.[0]?.data;
    if (!lensBase64data) {
      return '';
    }
    // Decode base64 - works in both Node.js and browser environments
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(lensBase64data, 'base64').toString('utf-8');
    } else if (typeof atob !== 'undefined') {
      return decodeURIComponent(
        atob(lensBase64data)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Helper function to find a resource by type in a Bundle or direct resource.
 *
 * @param resource - The resource to search (Bundle or direct resource)
 * @param resourceType - The type of resource to find
 * @returns The found resource or null
 */
export function findResourceByType(
  resource: FHIRResource | null | undefined,
  resourceType: string
): FHIRResource | null {
  if (!resource) {
    return null;
  }

  // If it's the resource we're looking for, return it
  if (resource.resourceType === resourceType) {
    return resource;
  }

  // If it's a Bundle, search in entries
  if (
    resource.resourceType === 'Bundle' &&
    Array.isArray((resource as unknown as { entry?: unknown[] }).entry)
  ) {
    const entries = (resource as unknown as { entry: Array<{ resource?: FHIRResource }> }).entry;
    const entry = entries.find(
      (e) => e.resource && e.resource.resourceType === resourceType
    );
    return entry?.resource || null;
  }

  return null;
}

/**
 * Extracts the HTML string from leaflet sections.
 *
 * @param leafletSectionList - Array of leaflet sections
 * @returns Combined HTML string from all sections
 */
export function getLeafletHTMLString(leafletSectionList: FHIRSection[]): string {
  let htmlString = '';
  for (const section of leafletSectionList) {
    if (section.text?.div) {
      htmlString += section.text.div;
    }
    if (section.section && Array.isArray(section.section)) {
      htmlString += getLeafletHTMLString(section.section);
    }
    if (section.entry && Array.isArray(section.entry)) {
      for (const entry of section.entry) {
        const resource = entry.resource as FHIRSection | undefined;
        if (resource?.text?.div) {
          htmlString += resource.text.div;
        }
        if (resource?.section && Array.isArray(resource.section)) {
          htmlString += getLeafletHTMLString(resource.section);
        }
      }
    }
  }
  return htmlString;
}

/**
 * Gets the leaflet sections from an ePI Composition.
 *
 * @param epi - The ePI Bundle
 * @returns Array of leaflet sections or null
 */
export function getLeaflet(epi: PreprocessedEPI): FHIRSection[] | null {
  const composition = findResourceByType(epi, 'Composition');
  if (!composition) {
    return null;
  }

  const comp = composition as { section?: FHIRSection[] };
  if (!comp.section || !Array.isArray(comp.section)) {
    return null;
  }

  // Find the main leaflet section (usually first section with subsections)
  const leafletSection = comp.section.find(
    (s) => s.section && Array.isArray(s.section)
  );
  if (!leafletSection) {
    return comp.section[0]?.section || null;
  }

  return leafletSection.section || null;
}

/**
 * Executes a single lens against an ePI with the given IPS.
 *
 * @param lens - The lens to execute
 * @param epi - The preprocessed ePI
 * @param ips - The International Patient Summary
 * @param htmlContent - The HTML content to transform
 * @param _options - Execution options (reserved for future use)
 * @returns The result of the lens execution
 */
export async function executeLens(
  lens: Lens,
  epi: PreprocessedEPI,
  ips: IPS,
  htmlContent: string,
  _options: ExecutionOptions = {}
): Promise<LensExecutionResult> {
  const lensIdentifier = getLensIdentifier(lens);
  const focusingErrors: FocusingError[] = [];

  try {
    const lensCode = extractLensCode(lens);

    if (!lensCode) {
      focusingErrors.push({
        message: 'Lens is undefined or empty',
        lensName: lensIdentifier,
      });
      return {
        success: false,
        error: 'Lens code is undefined or empty',
        lensId: lensIdentifier,
        focusingErrors,
      };
    }

    // Create lens function from code
    // Lens functions receive (epi, ips, pv, html) and return an object with enhance() and explanation() methods
    const lensFunction = new Function('epi', 'ips', 'pv', 'html', lensCode);
    const resObject: LensExecutionObject = lensFunction(epi, ips, {}, htmlContent);

    // Execute the enhance function
    const enhancedHtml = await resObject.enhance();

    // Get explanation if available
    let explanation = '';
    if (typeof resObject.explanation === 'function') {
      try {
        explanation = await resObject.explanation();
      } catch {
        // Explanation is optional, ignore errors
      }
    }

    return {
      success: true,
      result: enhancedHtml,
      explanation,
      lensId: lensIdentifier,
      focusingErrors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    focusingErrors.push({
      message: `Error executing lens: ${errorMessage}`,
      lensName: lensIdentifier,
    });
    return {
      success: false,
      error: `Lens execution failed: ${errorMessage}`,
      lensId: lensIdentifier,
      focusingErrors,
    };
  }
}

/**
 * Executes multiple lenses sequentially against an ePI.
 * Each lens receives the HTML output of the previous lens.
 *
 * @param lenses - Array of lenses to execute in order
 * @param epi - The preprocessed ePI
 * @param ips - The International Patient Summary
 * @param options - Execution options
 * @returns Array of results for each lens execution
 */
export async function executeLenses(
  lenses: Lens[],
  epi: PreprocessedEPI,
  ips: IPS,
  options: ExecutionOptions = {}
): Promise<LensExecutionResult[]> {
  const continueOnError = options.continueOnError ?? true;
  const results: LensExecutionResult[] = [];

  // Get leaflet sections and extract HTML
  const leafletSectionList = getLeaflet(epi);
  if (!leafletSectionList || leafletSectionList.length === 0) {
    return [
      {
        success: false,
        error: 'No leaflet sections found in ePI',
        lensId: 'system',
        focusingErrors: [{ message: 'No leaflet sections found', lensName: 'system' }],
      },
    ];
  }

  let currentHtml = getLeafletHTMLString(leafletSectionList);

  for (const lens of lenses) {
    const result = await executeLens(lens, epi, ips, currentHtml, options);
    results.push(result);

    if (result.success && result.result) {
      currentHtml = result.result;
    } else if (!continueOnError) {
      break;
    }
  }

  return results;
}

/**
 * Applies all lenses to an ePI and returns the enhanced ePI.
 * This is the main entry point that matches the focusing-manager interface.
 *
 * @param epi - The preprocessed ePI
 * @param ips - The International Patient Summary
 * @param lenses - Array of lenses to apply
 * @param options - Execution options
 * @returns The enhanced ePI and any focusing errors
 */
export async function applyLenses(
  epi: PreprocessedEPI,
  ips: IPS,
  lenses: Lens[],
  options: ExecutionOptions = {}
): Promise<ApplyLensesResult> {
  const focusingErrors: FocusingError[][] = [];

  // Clone the ePI to avoid mutating the original
  const resultEpi = JSON.parse(JSON.stringify(epi)) as PreprocessedEPI;

  const results = await executeLenses(lenses, resultEpi, ips, options);

  for (const result of results) {
    if (result.focusingErrors && result.focusingErrors.length > 0) {
      focusingErrors.push(result.focusingErrors);
    }
  }

  return {
    epi: resultEpi,
    focusingErrors,
  };
}

/**
 * Gets the final HTML content after executing all lenses.
 * Returns the original content if all lenses fail.
 *
 * @param lenses - Array of lenses to execute in order
 * @param epi - The preprocessed ePI
 * @param ips - The International Patient Summary
 * @param options - Execution options
 * @returns The final HTML content after lens execution
 */
export async function getProcessedHtml(
  lenses: Lens[],
  epi: PreprocessedEPI,
  ips: IPS,
  options: ExecutionOptions = {}
): Promise<string> {
  const leafletSectionList = getLeaflet(epi);
  const originalHtml = leafletSectionList
    ? getLeafletHTMLString(leafletSectionList)
    : '';

  const results = await executeLenses(lenses, epi, ips, options);

  // Find the last successful result
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].success && results[i].result) {
      return results[i].result!;
    }
  }

  return originalHtml;
}
