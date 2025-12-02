import {
  executeLens,
  executeLenses,
  getProcessedHtml,
  applyLenses,
  getLensIdentifier,
  extractLensCode,
  findResourceByType,
  getLeafletHTMLString,
  getLeaflet,
} from './executor';
import { Lens, PreprocessedEPI, IPS, FHIRResource } from './types';

// Helper to create base64 encoded lens code
function encodeLensCode(code: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(code, 'utf-8').toString('base64');
  }
  return btoa(code);
}

// Create a mock ePI FHIR Bundle with Composition
const createMockEPI = (htmlContent: string): PreprocessedEPI => ({
  resourceType: 'Bundle',
  id: 'test-epi-bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Composition',
        id: 'test-composition',
        section: [
          {
            title: 'Leaflet',
            section: [
              {
                title: 'Section 1',
                text: {
                  status: 'additional',
                  div: htmlContent,
                },
              },
            ],
          },
        ],
      },
    },
  ],
});

// Create a mock IPS FHIR Bundle
const createMockIPS = (): IPS => ({
  resourceType: 'Bundle',
  id: 'test-ips-bundle',
  type: 'document',
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'test-patient',
        identifier: [{ value: 'patient-123' }],
        name: [{ given: ['John'], family: 'Doe' }],
      },
    },
    {
      resource: {
        resourceType: 'Condition',
        id: 'test-condition',
        code: {
          coding: [{ code: 'diabetes', display: 'Diabetes' }],
        },
      },
    },
  ],
});

// Create a mock Lens FHIR Library resource
const createMockLens = (id: string, code: string): Lens => ({
  resourceType: 'Library',
  id: id,
  identifier: [{ value: id }],
  name: `Test Lens ${id}`,
  content: [
    {
      contentType: 'application/javascript',
      data: encodeLensCode(code),
    },
  ],
});

describe('getLensIdentifier', () => {
  it('should return identifier value when present', () => {
    const lens = createMockLens('test-lens', '');
    expect(getLensIdentifier(lens)).toBe('test-lens');
  });

  it('should return id when identifier is missing', () => {
    const lens: Lens = {
      resourceType: 'Library',
      id: 'fallback-id',
    };
    expect(getLensIdentifier(lens)).toBe('fallback-id');
  });

  it('should return unknown-lens when both are missing', () => {
    const lens: Lens = {
      resourceType: 'Library',
    };
    expect(getLensIdentifier(lens)).toBe('unknown-lens');
  });
});

describe('extractLensCode', () => {
  it('should decode base64 lens code', () => {
    const originalCode = 'return { enhance: () => html };';
    const lens = createMockLens('test', originalCode);
    expect(extractLensCode(lens)).toBe(originalCode);
  });

  it('should return empty string when content is missing', () => {
    const lens: Lens = {
      resourceType: 'Library',
      id: 'test',
    };
    expect(extractLensCode(lens)).toBe('');
  });
});

describe('findResourceByType', () => {
  it('should find resource in Bundle', () => {
    const epi = createMockEPI('<div>Test</div>');
    const composition = findResourceByType(epi, 'Composition');
    expect(composition).not.toBeNull();
    expect(composition?.resourceType).toBe('Composition');
  });

  it('should return direct resource if type matches', () => {
    const resource: FHIRResource = { resourceType: 'Patient', id: 'test' };
    expect(findResourceByType(resource, 'Patient')).toBe(resource);
  });

  it('should return null if resource not found', () => {
    const epi = createMockEPI('<div>Test</div>');
    expect(findResourceByType(epi, 'MedicationRequest')).toBeNull();
  });

  it('should return null for null input', () => {
    expect(findResourceByType(null, 'Patient')).toBeNull();
  });
});

describe('getLeafletHTMLString', () => {
  it('should extract HTML from sections', () => {
    const sections = [
      { text: { div: '<div>Section 1</div>' } },
      { text: { div: '<div>Section 2</div>' } },
    ];
    expect(getLeafletHTMLString(sections)).toBe('<div>Section 1</div><div>Section 2</div>');
  });

  it('should handle nested sections', () => {
    const sections = [
      {
        text: { div: '<div>Parent</div>' },
        section: [{ text: { div: '<div>Child</div>' } }],
      },
    ];
    expect(getLeafletHTMLString(sections)).toBe('<div>Parent</div><div>Child</div>');
  });
});

describe('getLeaflet', () => {
  it('should extract leaflet sections from ePI', () => {
    const epi = createMockEPI('<div>Test Content</div>');
    const leaflet = getLeaflet(epi);
    expect(leaflet).not.toBeNull();
    expect(Array.isArray(leaflet)).toBe(true);
  });

  it('should return null if Composition not found', () => {
    const epi: PreprocessedEPI = {
      resourceType: 'Bundle',
      entry: [],
    };
    expect(getLeaflet(epi)).toBeNull();
  });
});

describe('executeLens', () => {
  const mockEpi = createMockEPI('<div>Original content</div>');
  const mockIps = createMockIPS();

  it('should successfully execute a simple lens', async () => {
    const lensCode = `
      return {
        enhance: function() {
          return html.replace('Original', 'Modified');
        }
      };
    `;
    const lens = createMockLens('test-lens', lensCode);

    const result = await executeLens(lens, mockEpi, mockIps, '<div>Original content</div>');

    expect(result.success).toBe(true);
    expect(result.result).toBe('<div>Modified content</div>');
    expect(result.lensId).toBe('test-lens');
  });

  it('should handle lens with explanation function', async () => {
    const lensCode = `
      return {
        enhance: function() {
          return html;
        },
        explanation: function() {
          return 'This lens modified the content';
        }
      };
    `;
    const lens = createMockLens('explain-lens', lensCode);

    const result = await executeLens(lens, mockEpi, mockIps, '<div>Content</div>');

    expect(result.success).toBe(true);
    expect(result.explanation).toBe('This lens modified the content');
  });

  it('should handle async lens functions', async () => {
    const lensCode = `
      return {
        enhance: async function() {
          return html + ' - enhanced';
        }
      };
    `;
    const lens = createMockLens('async-lens', lensCode);

    const result = await executeLens(lens, mockEpi, mockIps, '<div>Content</div>');

    expect(result.success).toBe(true);
    expect(result.result).toBe('<div>Content</div> - enhanced');
  });

  it('should handle lens execution errors gracefully', async () => {
    const lensCode = `
      return {
        enhance: function() {
          throw new Error('Intentional error');
        }
      };
    `;
    const lens = createMockLens('error-lens', lensCode);

    const result = await executeLens(lens, mockEpi, mockIps, '<div>Content</div>');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Intentional error');
    expect(result.focusingErrors?.length).toBeGreaterThan(0);
  });

  it('should handle empty lens code', async () => {
    const lens: Lens = {
      resourceType: 'Library',
      id: 'empty-lens',
      identifier: [{ value: 'empty-lens' }],
      content: [{ data: '' }],
    };

    const result = await executeLens(lens, mockEpi, mockIps, '<div>Content</div>');

    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });
});

describe('executeLenses', () => {
  const mockEpi = createMockEPI('<div>Content</div>');
  const mockIps = createMockIPS();

  it('should execute multiple lenses in sequence', async () => {
    const lenses: Lens[] = [
      createMockLens('lens-1', `
        return {
          enhance: function() {
            return html.replace('Content', 'First');
          }
        };
      `),
      createMockLens('lens-2', `
        return {
          enhance: function() {
            return html.replace('First', 'Second');
          }
        };
      `),
    ];

    const results = await executeLenses(lenses, mockEpi, mockIps);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].result).toBe('<div>First</div>');
    expect(results[1].success).toBe(true);
    expect(results[1].result).toBe('<div>Second</div>');
  });

  it('should continue on error by default', async () => {
    const lenses: Lens[] = [
      createMockLens('error-lens', `
        return {
          enhance: function() {
            throw new Error('Error in lens 1');
          }
        };
      `),
      createMockLens('success-lens', `
        return {
          enhance: function() {
            return html + ' - modified';
          }
        };
      `),
    ];

    const results = await executeLenses(lenses, mockEpi, mockIps);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });

  it('should stop on error when continueOnError is false', async () => {
    const lenses: Lens[] = [
      createMockLens('error-lens', `
        return {
          enhance: function() {
            throw new Error('Error in lens 1');
          }
        };
      `),
      createMockLens('success-lens', `
        return {
          enhance: function() {
            return html + ' - modified';
          }
        };
      `),
    ];

    const results = await executeLenses(lenses, mockEpi, mockIps, { continueOnError: false });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });

  it('should return error when no leaflet sections found', async () => {
    const emptyEpi: PreprocessedEPI = {
      resourceType: 'Bundle',
      entry: [
        {
          resource: {
            resourceType: 'Composition',
            section: [],
          },
        },
      ],
    };

    const results = await executeLenses([], emptyEpi, mockIps);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('No leaflet sections');
  });
});

describe('getProcessedHtml', () => {
  const mockEpi = createMockEPI('<div>Original</div>');
  const mockIps = createMockIPS();

  it('should return processed HTML from successful lenses', async () => {
    const lenses: Lens[] = [
      createMockLens('lens-1', `
        return {
          enhance: function() {
            return html.replace('Original', 'Processed');
          }
        };
      `),
    ];

    const result = await getProcessedHtml(lenses, mockEpi, mockIps);

    expect(result).toBe('<div>Processed</div>');
  });

  it('should return original content if all lenses fail', async () => {
    const lenses: Lens[] = [
      createMockLens('error-lens', `
        return {
          enhance: function() {
            throw new Error('Error');
          }
        };
      `),
    ];

    const result = await getProcessedHtml(lenses, mockEpi, mockIps);

    expect(result).toBe('<div>Original</div>');
  });
});

describe('applyLenses', () => {
  const mockEpi = createMockEPI('<div>Original</div>');
  const mockIps = createMockIPS();

  it('should apply lenses and return enhanced ePI', async () => {
    const lenses: Lens[] = [
      createMockLens('lens-1', `
        return {
          enhance: function() {
            return html.replace('Original', 'Enhanced');
          }
        };
      `),
    ];

    const result = await applyLenses(mockEpi, mockIps, lenses);

    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toEqual([]);
  });

  it('should collect focusing errors', async () => {
    const lenses: Lens[] = [
      createMockLens('error-lens', `
        return {
          enhance: function() {
            throw new Error('Test error');
          }
        };
      `),
    ];

    const result = await applyLenses(mockEpi, mockIps, lenses);

    expect(result.focusingErrors.length).toBeGreaterThan(0);
  });
});
