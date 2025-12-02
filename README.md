# Lens-Execution-Environment

The Lens Execution Environment (LEE) is a TypeScript library that safely applies a set of lenses to a preprocessed ePI (electronic Product Information) given an IPS (International Patient Summary).

The LEE expects:
- **Compliant FHIR IPS** (International Patient Summary) as a FHIR Bundle
- **Lenses** according to the Gravitate Health Implementation Guide (FHIR Library resources with base64-encoded code)
- **Preprocessed ePI** as a FHIR Bundle with a Composition containing leaflet sections

## Installation

This package is published to GitHub Packages. To install it, you'll need to authenticate with GitHub Packages.

### Configure npm for GitHub Packages

Create or edit your `.npmrc` file to include:

```
@gravitate-health:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

### Install the package

```bash
npm install @gravitate-health/lens-execution-environment
```

## Usage

### TypeScript / ES Modules

```typescript
import {
  applyLenses,
  executeLenses,
  getProcessedHtml,
  Lens,
  PreprocessedEPI,
  IPS
} from '@gravitate-health/lens-execution-environment';

// ePI is a FHIR Bundle with a Composition containing leaflet sections
const epi: PreprocessedEPI = {
  resourceType: 'Bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Composition',
        section: [
          {
            title: 'Leaflet',
            section: [
              {
                title: 'What is this medicine',
                text: {
                  div: '<div xmlns="http://www.w3.org/1999/xhtml">Product information...</div>'
                }
              }
            ]
          }
        ]
      }
    }
  ]
};

// IPS is a FHIR Bundle with patient information
const ips: IPS = {
  resourceType: 'Bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        identifier: [{ value: 'patient-123' }]
      }
    },
    {
      resource: {
        resourceType: 'Condition',
        code: { coding: [{ code: 'diabetes' }] }
      }
    }
  ]
};

// Lens is a FHIR Library resource with base64-encoded transformation code
const lens: Lens = {
  resourceType: 'Library',
  identifier: [{ value: 'highlight-allergies' }],
  content: [
    {
      contentType: 'application/javascript',
      data: btoa(`
        return {
          enhance: function() {
            // Transform the HTML based on patient data
            return html.replace(/penicillin/gi, '<mark>$&</mark>');
          },
          explanation: function() {
            return 'Highlighted allergens based on patient allergies';
          }
        };
      `)
    }
  ]
};

// Apply lenses and get enhanced ePI
const result = await applyLenses(epi, ips, [lens]);
console.log(result.epi); // Enhanced ePI
console.log(result.focusingErrors); // Any errors that occurred

// Or get just the final HTML
const processedHtml = await getProcessedHtml([lens], epi, ips);
```

### CommonJS

```javascript
const { applyLenses, getProcessedHtml } = require('@gravitate-health/lens-execution-environment');

// Same usage as above (with await inside async function)
```

### Browser / Webview

The ESM build can be imported directly in modern browsers:

```html
<script type="module">
  import { applyLenses, getProcessedHtml } from './node_modules/@gravitate-health/lens-execution-environment/dist/esm/index.js';
  
  // Use the library (async functions)
</script>
```

## API

### Types

- **`IPS`**: International Patient Summary as a FHIR Bundle
- **`PreprocessedEPI`**: Electronic Product Information as a FHIR Bundle with Composition
- **`Lens`**: FHIR Library resource containing transformation code
- **`LensExecutionResult`**: Result of executing a single lens
- **`ApplyLensesResult`**: Result of applying all lenses (enhanced ePI + errors)
- **`FocusingError`**: Error that occurred during lens execution
- **`ExecutionOptions`**: Options for lens execution

### Functions

- **`applyLenses(epi, ips, lenses, options?)`**: Apply lenses and return enhanced ePI
- **`executeLens(lens, epi, ips, htmlContent, options?)`**: Execute a single lens
- **`executeLenses(lenses, epi, ips, options?)`**: Execute multiple lenses sequentially
- **`getProcessedHtml(lenses, epi, ips, options?)`**: Get the final HTML after applying all lenses

### Helper Functions

- **`getLensIdentifier(lens)`**: Extract lens identifier from a Lens resource
- **`extractLensCode(lens)`**: Decode base64 lens code from a Lens resource
- **`findResourceByType(resource, resourceType)`**: Find a resource by type in a Bundle
- **`getLeaflet(epi)`**: Extract leaflet sections from an ePI
- **`getLeafletHTMLString(sections)`**: Get HTML string from leaflet sections

### Lens Function Interface

Lens code must return an object with an `enhance()` method (and optionally an `explanation()` method):

```javascript
// Lens code receives: epi, ips, pv (empty object), html (string)
return {
  enhance: function() {
    // Transform and return the HTML
    return html.replace(/keyword/g, '<mark>$&</mark>');
  },
  explanation: function() {
    // Optional: return explanation text
    return 'Description of what the lens did';
  }
};
```

### Execution Options

```typescript
interface ExecutionOptions {
  timeout?: number;          // Timeout in ms (default: 5000)
  continueOnError?: boolean; // Continue if a lens fails (default: true)
}
```

## Development

### Prerequisites

- Node.js 18.x or later
- npm 9.x or later

### Setup

```bash
# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### Project Structure

```
src/
├── index.ts         # Main entry point and exports
├── types.ts         # FHIR-compliant TypeScript interfaces
├── executor.ts      # Lens execution logic
└── executor.test.ts # Unit tests (26 tests)
```

## Publishing

The package is automatically published to GitHub Packages when a new release is created. The CI workflow runs on every push and pull request to ensure code quality.

## License

Apache-2.0
