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
  /** List of all focusing errors that occurred */
  focusingErrors: FocusingError[];
}
