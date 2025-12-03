# Test Suite Summary

## Overview

The Lens Execution Environment now has a comprehensive test suite that automatically tests all combinations of ePIs, IPSs, and Lenses.

## Current Test Coverage

- **2 sample ePIs** × **2 sample IPSs** × **2 sample Lenses** = **Multiple test combinations**
- **40 tests total** covering:
  - Integration tests (4 ePI+IPS combinations × 6 tests each)
  - Edge case handling (3 tests)
  - Data validation (13 tests)

## Test Structure

```
test-data/
├── epis/           # Electronic Product Information documents
│   ├── sample-epi-1.json
│   └── sample-epi-2.json
├── ips/            # International Patient Summaries
│   ├── sample-ips-1.json
│   └── sample-ips-2.json
└── lenses/         # Lens transformations
    ├── sample-lens-1.json  (Highlight Allergies)
    └── sample-lens-2.json  (Highlight Conditions)
```

## Test Categories

### 1. Integration Tests
For each ePI + IPS combination:
- ✅ Applies all lenses without errors
- ✅ Returns a valid enhanced ePI
- ✅ Tracks focusing errors properly
- ✅ Tests each lens individually
- ✅ Handles empty lens arrays

### 2. Edge Case Tests
- ✅ Handles invalid ePIs gracefully
- ✅ Handles invalid IPSs gracefully
- ✅ Handles invalid lenses gracefully

### 3. Data Validation Tests
- ✅ Validates ePI structure (FHIR Bundle with Composition)
- ✅ Validates IPS structure (FHIR Bundle with Patient)
- ✅ Validates Lens structure (FHIR Library with base64 code)

## Running Tests

```bash
# Run all tests
npm test

# Run with verbose output
npm test -- --verbose

# Run with coverage
npm test -- --coverage
```

## Adding Your Own Test Data

Simply add JSON files to the appropriate folders:

1. **Add an ePI**: Create `test-data/epis/your-epi.json`
2. **Add an IPS**: Create `test-data/ips/your-ips.json`
3. **Add a Lens**: Create `test-data/lenses/your-lens.json`

The test suite will automatically discover and test all new combinations!

## Sample Lenses

### sample-lens-1: Highlight Allergies
Wraps "penicillin" in `<mark>` tags to highlight allergens.

### sample-lens-2: Highlight Conditions
Wraps "diabetes" in `<strong>` tags to emphasize medical conditions.

## Example: Creating a New Lens

1. Write your lens code in JavaScript:
```javascript
return {
  enhance: function() {
    return html.replace(/important-keyword/gi, '<span class="highlight">$&</span>');
  },
  explanation: function() {
    return 'Highlighted important keywords';
  }
};
```

2. Encode to Base64:
```bash
echo 'your-code-here' | base64
```

3. Create a FHIR Library resource in `test-data/lenses/my-lens.json` with the Base64 content

4. Run tests - your lens will be automatically tested against all ePI+IPS combinations!

## CI/CD Integration

The test suite runs automatically in GitHub Actions on every push and pull request, ensuring all lens combinations work correctly.
