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

1.  **Build and Testing:** Standard TypeScript practices apply:
    *   **Build:** `npm run build` (builds CJS, ESM, types, and copies worker file).
    *   **Style Fixes:** `npm run lint:fix`.
    *   **Run Tests:** `npm test` (377 comprehensive tests including malicious lens handling).

2.  **Lens Compilation:** The actual lens code (JavaScript) must be converted into a FHIR resource (`Lens Profile`) for storage and distribution. Use the **FHIR lens bundler** tool to encode JavaScript into **Base64** format for the `content` field of the FHIR attachment. The LEE will decode (recode as UTF-8) and execute this code at runtime.

3.  **Lens Execution Architecture:** The LEE uses **Worker Threads** for secure, isolated lens execution:
    *   Each lens runs in a separate Worker Thread (`src/lens-worker.js`).
    *   Workers are terminated after timeout (default 1000ms, configurable via `LensExecutionConfig`).
    *   This architecture protects against malicious code, infinite loops, and blocking operations.
    *   Worker cleanup is automatic (terminate + garbage collection).

### III. Project-Specific Conventions & Patterns

1.  **Lens Data Structure (FHIR `Library` Profile):** Lenses are FHIR resources compliant with the `Lens Profile` (a profile derived from the FHIR `Library` resource).
    *   The lens code must reside in `Library.content` as Base64 encoded data.
    *   The lens must specify the `lee-version` extension (`http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/lee-version`). Which indicates the compatible LEE version, the LEE should then be able to offer backward compatibility.
    *   Lenses should have a unique identifier.

2.  **Interaction Pattern (HTML Manipulation):** Lenses must implement functions to apply changes to the embedded HTML in the ePI.
    *   **Attention Modification:** Use `modifyCSSClass()` with two standard classes: **`highlight`** (increased attention) or **`collapse`** (decreased attention/hideable).
    *   **Supplementary Content:** Use `addNewContent()` to inject HTML tags (e.g., for videos, hyperlinks, or glossary hovers).
    *   **Priority Rule:** When multiple lenses apply changes, the **largest attention detail is prioritized** (i.e., `highlight` over `collapse`).

3.  **Security & Timeout Configuration:**
    *   **Default Timeout:** 1000ms (1 second) per lens function invocation (both `enhance()` and `explanation()`).
    *   **Configuration:** Use `LensExecutionConfig` interface to customize timeout: `applyLenses(epi, ips, lenses, { lensExecutionTimeout: 2000 })`.
    *   **Defaults Retrieval:** Call `getDefaultConfig()` to get default configuration values.
    *   **Worker Thread Isolation:** Each lens executes in an isolated Worker Thread for security and timeout enforcement.
    *   **Error Handling:** Timeout and execution errors are captured in `focusingErrors` array without crashing the entire process.
    *   **Protection:** Worker Threads protect against infinite loops, blocking code, and malicious operations.

### IV. Key Files/Directories

*   **Core Execution:** `src/executor.ts` - Main lens execution logic with Worker Thread orchestration.
*   **Worker Thread:** `src/lens-worker.js` - Isolated JavaScript worker for lens execution (plain JS to avoid module issues).
*   **Type Definitions:** `src/types.ts` - TypeScript interfaces including `LensExecutionConfig` and `ApplyLensesResult`.
*   **Test Suite:** `src/executor.test.ts` - 377 comprehensive tests including malicious lens handling and timeout verification.
*   **Test Data:** `test-data/lenses/malicious-*.json` - Test lenses for error handling (throws, syntax errors, infinite loops, etc.).
*   **Lens Examples:** External repository `Gravitate-Health/lens-selector-example`.
*   **Deployment Configuration (FM Discovery):** Kubernetes deployments must include the label `eu.gravitate-health.fosps.focusing: "true"` for the Focusing Manager to discover them.
*   **API Specification:** Refer to the external OAS Swagger API for the Focusing Manager interfaces: `https://fosps.gravitatehealth.eu/swagger-fosps/?urls.primaryName=Focusing%20Manager`.

### V. Release Process

Follow these steps to release a new version of the LEE package:

1.  **Lint:** Verify code quality passes ESLint checks
    ```bash
    npm run lint
    ```
    *   Should pass with only warnings (no errors)
    *   All warnings are currently `@typescript-eslint/no-explicit-any` (acceptable)

2.  **Build:** Compile TypeScript to CJS, ESM, types, and copy worker file
    ```bash
    npm run build
    ```
    *   Builds: `dist/cjs/`, `dist/esm/`, `dist/types/`
    *   Copies: `src/lens-worker.js` to output directories

3.  **Test:** Run comprehensive test suite (377 tests)
    ```bash
    npm test
    ```
    *   All 377 tests must pass
    *   Includes integration tests, malicious lens handling, timeout verification
    *   Test duration: ~130-135 seconds

4.  **Version Bump:** Update package version based on semver
    ```bash
    npm version patch   # Bug fixes (0.0.4 → 0.0.5)
    npm version minor   # New features, backwards compatible (0.0.4 → 0.1.0)
    npm version major   # Breaking changes (0.0.4 → 1.0.0)
    ```
    *   Default to `patch` if not specified
    *   This automatically updates `package.json` and `package-lock.json`
    *   Creates a git commit with message "v{version}"
    *   Creates a git tag "v{version}"

5.  **Review Changes:** Verify the automated commit and tag
    ```bash
    git show HEAD        # Review the version bump commit
    git tag --list       # Verify new tag was created
    ```

6.  **Push:** Push commits and tags to remote repository
    ```bash
    git push && git push --tags
    ```
    *   Pushes the version commit to main branch
    *   Pushes the version tag (triggers any CI/CD if configured)

7.  **NPM Login:** Ensure authentication is ready (if not already logged in)
    ```bash
    npm login
    ```
    *   Required for publishing to npm registry or GitHub Packages
    *   Only needed once per session/machine

8.  **Publish:** Publish the package to the registry
    ```bash
    npm publish
    ```
    *   Runs `prepublishOnly` script automatically (builds again)
    *   Uploads package to configured registry
    *   Package becomes available at `@gravitate-health/lens-execution-environment@{version}`

**Quick Release Command (after manual verification):**
```bash
npm run lint && npm run build && npm test && npm version patch && git push && git push --tags && npm publish
```

**Important Notes:**
-   Always run lint, build, and test before version bump
-   Use semantic versioning: major.minor.patch
-   Never force push or delete published versions
-   Version bump creates commit + tag automatically
-   The `prepublishOnly` script ensures fresh build before publish