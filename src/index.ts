/**
 * Lens Execution Environment (LEE)
 *
 * This library safely applies a set of lenses to a preprocessed ePI given an IPS.
 * It can be used in TypeScript/JavaScript projects and can also be imported directly
 * in browser/webview environments.
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
} from './types';

// Export executor functions
export { executeLens, executeLenses, getProcessedHtml } from './executor';
