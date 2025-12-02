/**
 * Represents an International Patient Summary (IPS).
 * The IPS contains patient health information used to personalize the ePI.
 */
export interface IPS {
  /** Unique identifier for the patient summary */
  id?: string;
  /** Patient information */
  patient?: Record<string, unknown>;
  /** List of conditions/diagnoses */
  conditions?: Array<Record<string, unknown>>;
  /** List of medications */
  medications?: Array<Record<string, unknown>>;
  /** List of allergies */
  allergies?: Array<Record<string, unknown>>;
  /** Additional data that may be used by lenses */
  [key: string]: unknown;
}

/**
 * Represents a preprocessed electronic Product Information (ePI).
 */
export interface PreprocessedEPI {
  /** Unique identifier for the ePI */
  id?: string;
  /** The HTML content of the ePI */
  htmlContent: string;
  /** Metadata about the ePI */
  metadata?: Record<string, unknown>;
  /** Additional data that may be used by lenses */
  [key: string]: unknown;
}

/**
 * Represents a Lens that can be applied to an ePI.
 * A lens is a transformation that personalizes the ePI based on patient data.
 */
export interface Lens {
  /** Unique identifier for the lens */
  id: string;
  /** Human-readable name of the lens */
  name: string;
  /** Description of what the lens does */
  description?: string;
  /**
   * The lens execution function as a string.
   * This function should accept (epi: PreprocessedEPI, ips: IPS) and return the modified ePI HTML content.
   */
  lensFunction: string;
}

/**
 * Result of executing a lens.
 */
export interface LensExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** The resulting HTML content after lens application (if successful) */
  result?: string;
  /** Error message if execution failed */
  error?: string;
  /** The lens that was executed */
  lensId: string;
}

/**
 * Options for lens execution.
 */
export interface ExecutionOptions {
  /** Timeout in milliseconds for lens execution (default: 5000ms) */
  timeout?: number;
  /** Whether to continue executing other lenses if one fails (default: true) */
  continueOnError?: boolean;
}
