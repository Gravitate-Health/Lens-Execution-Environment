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
  FocusingError,
  ApplyLensesResult,
  LensExecutionObject,
  LensExecutionConfig,
} from './types';

// Export main lens execution function and configuration
export { applyLenses, getDefaultConfig } from './executor';
