## copilot-instrucctions.md: Lens Execution Environment (LEE)

The TypeScript project serves as the **Lens Execution Environment (LEE)**, for focusing logic (Lenses) on electronic Product Information (ePIs). This module supports both server-side and client-side focusing, prioritizing developer consistency across execution modes.

### I. Big Picture Architecture & Data Flow

| Component | Role in Focusing Flow | Integration Pattern |
| :--- | :--- | :--- |
| **Lens Execution Env (LEE)** | Executes the lens logic (the `enhance()` function) on preprocessed ePIs. It acts like an optical stack where the output of one lens is the input for the next. | Exposed internally to the Focusing Manager (FM). Also runnable client-side by injecting JavaScript variables. |
| **Focusing Manager (FM)** | Orchestrates the focusing process (Preprocessing, Lens retrieval, execution). The FM coordinates server-side focusing. | Requires auto-discovery via Kubernetes labels for other components (e.g., Preprocessors require `eu.gravitate-health.fosps.preprocessing=True`). |
| **Inputs** | Preprocessed ePI (`p(ePI)`) and personalized data (International Patient Summary (IPS) + Persona Vector (PV)). | Data must be FHIR compliant. Sensitive patient data (IPS/PV) can be sent implicitly by the client in hybrid server-side focusing to maintain privacy. |
| **Key Constraint (The "Why")** | Lenses **must not remove or edit** ePI content due to legal/regulatory constraints; they can only modify presentation style or add supplementary content. |

The FHIR Implementation Guide for LEE and Lenses is available at:
* Gravitate Health Focusing IG: https://build.fhir.org/ig/hl7-eu/gravitate-health/
* Lens Profile: https://build.fhir.org/ig/hl7-eu/gravitate-health/StructureDefinition-lens.html
* ePI processing: https://build.fhir.org/ig/hl7-eu/gravitate-health/09-epi-processing.html
* IPS:https://build.fhir.org/ig/HL7/fhir-ips/en/
* IPS considerations: https://build.fhir.org/ig/hl7-eu/gravitate-health/11-ips-considerations.html


### II. Critical Developer Workflows

1.  **Build and Testing:** Standard TypeScript/LoopBack 4 practices apply:
    *   **Build:** `npm run build` (standard build) or `npm run rebuild` (force full clean build).
    *   **Style Fixes:** `npm run lint:fix`.
    *   **Run Tests:** `npm test`.

2.  **Lens Compilation:** The actual lens code (JavaScript) must be converted into a FHIR resource (`Lens Profile`) for storage and distribution. Use the **FHIR lens bundler** tool to encode JavaScript into **Base64** format for the `content` field of the FHIR attachment. The LEE will decode (recode as UTF-8) and execute this code at runtime.

### III. Project-Specific Conventions & Patterns

1.  **Lens Data Structure (FHIR `Library` Profile):** Lenses are FHIR resources compliant with the `Lens Profile` (a profile derived from the FHIR `Library` resource).
    *   The lens code must reside in `Library.content` as Base64 encoded data.
    *   The lens must specify the `lee-version` extension (`http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/lee-version`). Which indicates the compatible LEE version, the LEE should then be able to offer backward compatibility.
    *   Lenses should have a unique identifier.

2.  **Interaction Pattern (HTML Manipulation):** Lenses must implement functions to apply changes to the embedded HTML in the ePI.
    *   **Attention Modification:** Use `modifyCSSClass()` with two standard classes: **`highlight`** (increased attention) or **`collapse`** (decreased attention/hideable).
    *   **Supplementary Content:** Use `addNewContent()` to inject HTML tags (e.g., for videos, hyperlinks, or glossary hovers).
    *   **Priority Rule:** When multiple lenses apply changes, the **largest attention detail is prioritized** (i.e., `highlight` over `collapse`).

### IV. Key Files/Directories

*   **Lens Examples:** `src/lenses` (e.g., in `Gravitate-Health/lens-selector-example`).
*   **Deployment Configuration (FM Discovery):** Kubernetes deployments (e.g., `kubernetes-yaml/001_lens-selector-example-service.yaml`) must include the label `eu.gravitate-health.fosps.focusing: "true"` for the Focusing Manager to discover them.
*   **API Specification:** Refer to the external OAS Swagger API for the Focusing Manager interfaces: `https://fosps.gravitatehealth.eu/swagger-fosps/?urls.primaryName=Focusing%20Manager`.