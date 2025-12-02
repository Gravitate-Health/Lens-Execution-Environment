/**
 * FHIR Resource reference structure
 */
export interface FHIRReference {
  reference?: string;
  display?: string;
}

/**
 * FHIR Coding structure
 */
export interface FHIRCoding {
  system?: string;
  code?: string;
  display?: string;
}

/**
 * FHIR CodeableConcept structure
 */
export interface FHIRCodeableConcept {
  coding?: FHIRCoding[];
  text?: string;
}

/**
 * FHIR Identifier structure
 */
export interface FHIRIdentifier {
  system?: string;
  value?: string;
}

/**
 * FHIR Bundle entry structure
 */
export interface FHIRBundleEntry {
  resource?: FHIRResource;
  fullUrl?: string;
}

/**
 * Base FHIR Resource structure
 */
export interface FHIRResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

/**
 * FHIR Bundle structure - used for both ePI and IPS
 */
export interface FHIRBundle extends FHIRResource {
  resourceType: 'Bundle';
  type?: string;
  entry?: FHIRBundleEntry[];
}

/**
 * Narrative text in a FHIR section
 */
export interface FHIRNarrative {
  status?: string;
  div?: string;
}

/**
 * Section structure in a Composition resource
 */
export interface FHIRSection {
  title?: string;
  code?: FHIRCodeableConcept;
  text?: FHIRNarrative;
  section?: FHIRSection[];
  entry?: FHIRBundleEntry[];
}

/**
 * Represents an International Patient Summary (IPS) as a FHIR Bundle.
 * The IPS contains patient health information used to personalize the ePI.
 */
export type IPS = FHIRBundle;

/**
 * Represents a preprocessed electronic Product Information (ePI) as a FHIR Bundle.
 * Contains a Composition resource with leaflet sections.
 */
export type PreprocessedEPI = FHIRBundle;

/**
 * Content attachment for a Lens (FHIR Library resource)
 */
export interface LensContent {
  contentType?: string;
  /** Base64-encoded lens code */
  data?: string;
}

/**
 * Represents a Lens as a FHIR Library resource.
 * A lens is a transformation that personalizes the ePI based on patient data.
 */
export interface Lens extends FHIRResource {
  resourceType: 'Library';
  /** Lens identifiers */
  identifier?: FHIRIdentifier[];
  /** Human-readable name of the lens */
  name?: string;
  /** Description of what the lens does */
  description?: string;
  /** The lens code content (base64-encoded) */
  content?: LensContent[];
}

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
 * Result of executing a lens.
 */
export interface LensExecutionResult {
  /** Whether the execution was successful */
  success: boolean;
  /** The resulting HTML content after lens application (if successful) */
  result?: string;
  /** Explanation text from the lens (if available) */
  explanation?: string;
  /** Error message if execution failed */
  error?: string;
  /** The lens identifier that was executed */
  lensId: string;
  /** List of focusing errors that occurred */
  focusingErrors?: FocusingError[];
}

/**
 * Result of applying all lenses to an ePI.
 */
export interface ApplyLensesResult {
  /** The enhanced ePI */
  epi: PreprocessedEPI;
  /** List of all focusing errors that occurred */
  focusingErrors: FocusingError[][];
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
