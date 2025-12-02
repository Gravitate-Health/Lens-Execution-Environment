# Lens-Execution-Environment

The Lens Execution Environment (LEE) is a TypeScript library that safely applies a set of lenses to a preprocessed ePI (electronic Product Information) given an IPS (International Patient Summary).

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
import { executeLenses, getProcessedHtml, Lens, PreprocessedEPI, IPS } from '@gravitate-health/lens-execution-environment';

// Define your ePI
const epi: PreprocessedEPI = {
  id: 'epi-123',
  htmlContent: '<div>Product Information Content</div>',
};

// Define your IPS
const ips: IPS = {
  id: 'ips-456',
  patient: { name: 'John Doe', age: 45 },
  conditions: [{ code: 'diabetes' }],
  allergies: [{ substance: 'penicillin' }],
};

// Define your lenses
const lenses: Lens[] = [
  {
    id: 'highlight-allergies',
    name: 'Allergy Highlighter',
    lensFunction: `function(epi, ips) {
      // Transform the HTML based on patient allergies
      return epi.htmlContent;
    }`,
  },
];

// Execute lenses and get results
const results = executeLenses(lenses, epi, ips);

// Or get just the final HTML
const processedHtml = getProcessedHtml(lenses, epi, ips);
```

### CommonJS

```javascript
const { executeLenses, getProcessedHtml } = require('@gravitate-health/lens-execution-environment');

// Same usage as above
```

### Browser / Webview

The ESM build can be imported directly in modern browsers:

```html
<script type="module">
  import { executeLenses, getProcessedHtml } from './node_modules/@gravitate-health/lens-execution-environment/dist/esm/index.js';
  
  // Use the library
</script>
```

## API

### Types

- **`IPS`**: International Patient Summary containing patient health information
- **`PreprocessedEPI`**: Electronic Product Information with HTML content
- **`Lens`**: A transformation to apply to the ePI
- **`LensExecutionResult`**: Result of executing a single lens
- **`ExecutionOptions`**: Options for lens execution

### Functions

- **`executeLens(lens, epi, ips, options?)`**: Execute a single lens
- **`executeLenses(lenses, epi, ips, options?)`**: Execute multiple lenses sequentially
- **`getProcessedHtml(lenses, epi, ips, options?)`**: Get the final HTML after applying all lenses

### Execution Options

```typescript
interface ExecutionOptions {
  timeout?: number;        // Timeout in ms (default: 5000)
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
├── types.ts         # TypeScript interfaces and types
├── executor.ts      # Lens execution logic
└── executor.test.ts # Unit tests
```

## Publishing

The package is automatically published to GitHub Packages when a new release is created. The CI workflow runs on every push and pull request to ensure code quality.

## License

Apache-2.0
