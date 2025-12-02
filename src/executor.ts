import {
  IPS,
  PreprocessedEPI,
  Lens,
  LensExecutionResult,
  ExecutionOptions,
} from './types';

/**
 * Executes a single lens function against an ePI with the given IPS.
 *
 * @param lens - The lens to execute
 * @param epi - The preprocessed ePI to transform
 * @param ips - The International Patient Summary for personalization
 * @param _options - Execution options (reserved for future use)
 * @returns The result of the lens execution
 */
export function executeLens(
  lens: Lens,
  epi: PreprocessedEPI,
  ips: IPS,
  _options: ExecutionOptions = {}
): LensExecutionResult {
  try {
    // Create a safe execution context
    // Note: In a browser/webview context, we execute the lens function
    // In a more secure environment, this could be sandboxed
    const lensExecutor = new Function(
      'epi',
      'ips',
      `
      "use strict";
      const lensFunction = ${lens.lensFunction};
      return lensFunction(epi, ips);
      `
    );

    // Execute the lens function
    const result: string = lensExecutor(epi, ips);

    return {
      success: true,
      result: result,
      lensId: lens.id,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Lens execution failed: ${errorMessage}`,
      lensId: lens.id,
    };
  }
}

/**
 * Executes multiple lenses sequentially against an ePI.
 * Each lens receives the output of the previous lens.
 *
 * @param lenses - Array of lenses to execute in order
 * @param epi - The preprocessed ePI to transform
 * @param ips - The International Patient Summary for personalization
 * @param options - Execution options
 * @returns Array of results for each lens execution
 */
export function executeLenses(
  lenses: Lens[],
  epi: PreprocessedEPI,
  ips: IPS,
  options: ExecutionOptions = {}
): LensExecutionResult[] {
  const continueOnError = options.continueOnError ?? true;
  const results: LensExecutionResult[] = [];

  let currentEpi: PreprocessedEPI = { ...epi };

  for (const lens of lenses) {
    const result = executeLens(lens, currentEpi, ips, options);
    results.push(result);

    if (result.success && result.result) {
      // Update the ePI with the result for the next lens
      currentEpi = {
        ...currentEpi,
        htmlContent: result.result,
      };
    } else if (!continueOnError) {
      // Stop execution if continueOnError is false and there's an error
      break;
    }
  }

  return results;
}

/**
 * Gets the final HTML content after executing all lenses.
 * Returns the original content if all lenses fail.
 *
 * @param lenses - Array of lenses to execute in order
 * @param epi - The preprocessed ePI to transform
 * @param ips - The International Patient Summary for personalization
 * @param options - Execution options
 * @returns The final HTML content after lens execution
 */
export function getProcessedHtml(
  lenses: Lens[],
  epi: PreprocessedEPI,
  ips: IPS,
  options: ExecutionOptions = {}
): string {
  const results = executeLenses(lenses, epi, ips, options);

  // Find the last successful result
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].success && results[i].result) {
      return results[i].result!;
    }
  }

  // Return original content if no successful execution
  return epi.htmlContent;
}
