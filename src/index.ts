/**
 * Lens Execution Environment (LEE)
 *
 * This library safely applies a set of lenses to a preprocessed ePI given an IPS.
 * It can be used in TypeScript/JavaScript projects and can also be imported directly
 * in browser/webview environments.
 *
 * Lenses are FHIR Library resources with base64-encoded transformation code.
 * The ePI and IPS are expected to be compliant FHIR Bundles.
 *
 * @security Lens code is executed using `new Function()`. Only use lenses from trusted sources.
 *
 * @packageDocumentation
 */

// Export types
export {
  IPS,
  PreprocessedEPI,
  Lens,
  LensExecutionResult,
  ExecutionOptions,
  FocusingError,
  ApplyLensesResult,
  FHIRBundle,
  FHIRResource,
  FHIRBundleEntry,
  FHIRReference,
  FHIRCoding,
  FHIRCodeableConcept,
  FHIRIdentifier,
  FHIRNarrative,
  FHIRSection,
  LensContent,
  LensExecutionObject,
} from './types';

// Export executor functions
export {
  executeLens,
  executeLenses,
  getProcessedHtml,
  applyLenses,
  getLensIdentifier,
  extractLensCode,
  findResourceByType,
  getLeafletHTMLString,
  getLeaflet,
} from './executor';
