/**
 * Object returned by lens function execution.
 * Lenses return an object with enhance() and optional explanation() methods.
 */
export interface LensExecutionObject {
  /** Function that applies the lens transformation and returns enhanced HTML */
  enhance: () => Promise<string> | string;
  /** Optional function that returns an explanation of what the lens did */
  explanation?: () => Promise<string> | string;
}

/**
 * Focusing error structure
 */
export interface FocusingError {
  message: string;
  lensName: string;
}

/**
 * Result of applying all lenses to an ePI.
 */
export interface ApplyLensesResult {
  /** The enhanced ePI */
  epi: any;
  /** List of focusing errors per lens. Each element is an array of errors for that lens. */
  focusingErrors: FocusingError[][];
}

/**
 * Configuration options for the Lens Execution Environment.
 * All options are optional and will fall back to sensible defaults.
 */
export interface LensExecutionConfig {
  /**
   * Maximum time in milliseconds for lens function execution (enhance or explanation).
   * If a lens function takes longer than this, it will be terminated.
   * @default 1000 (1 second)
   */
  lensExecutionTimeout?: number;
}
