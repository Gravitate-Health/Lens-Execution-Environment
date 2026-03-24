import { applyLenses } from './executor';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test suite for Lens Execution Environment
 * 
 * This test suite automatically discovers and tests all combinations of:
 * - ePIs (Electronic Product Information) from test-data/epis/
 * - IPSs (International Patient Summaries) from test-data/ips/
 * - Lenses from test-data/lenses/
 */

const TEST_DATA_DIR = path.join(__dirname, '..', 'test-data');
const EPIS_DIR = path.join(TEST_DATA_DIR, 'epis');
const IPS_DIR = path.join(TEST_DATA_DIR, 'ips');
const LENSES_DIR = path.join(TEST_DATA_DIR, 'lenses');

/**
 * Load all JSON files from a directory
 */
function loadJsonFiles(directory: string): Array<{ name: string; data: any }> {
  if (!fs.existsSync(directory)) {
    console.warn(`Directory not found: ${directory}`);
    return [];
  }

  const files = fs.readdirSync(directory)
    .filter(f => f.endsWith('.json'))
    // Exclude malicious lenses from general test runs
    .filter(f => !f.startsWith('malicious-'));
  return files.map(filename => ({
    name: filename.replace('.json', ''),
    data: JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf-8'))
  }));
}

/**
 * Discover all test data
 */
function discoverTestData() {
  const epis = loadJsonFiles(EPIS_DIR);
  const ipsList = loadJsonFiles(IPS_DIR);
  const lenses = loadJsonFiles(LENSES_DIR);

  console.log(`Discovered ${epis.length} ePIs, ${ipsList.length} IPSs, and ${lenses.length} lenses`);

  return { epis, ipsList, lenses };
}

describe('Lens Execution Environment - Integration Tests', () => {
  const { epis, ipsList, lenses } = discoverTestData();

  // Ensure we have test data
  it('should have test data available', () => {
    expect(epis.length).toBeGreaterThan(0);
    expect(ipsList.length).toBeGreaterThan(0);
    expect(lenses.length).toBeGreaterThan(0);
  });

  // Test each ePI + IPS combination with all lenses
  epis.forEach(({ name: epiName, data: epi }) => {
    ipsList.forEach(({ name: ipsName, data: ips }) => {
      describe(`${epiName} + ${ipsName}`, () => {
        
        it('should apply all lenses without throwing errors', async () => {
          const lensData = lenses.map(l => l.data);
          
          let result;
          expect(async () => {
            result = await applyLenses(epi, ips, lensData);
          }).not.toThrow();

          // Wait for the promise to resolve
          result = await applyLenses(epi, ips, lensData);
          
          // Result should have expected structure
          expect(result).toBeDefined();
          expect(result).toHaveProperty('epi');
          expect(result).toHaveProperty('focusingErrors');
        });

        it('should return an enhanced ePI', async () => {
          const lensData = lenses.map(l => l.data);
          const result = await applyLenses(epi, ips, lensData);
          
          expect(result.epi).toBeDefined();
          expect(result.epi.resourceType).toBe('Bundle');
        });

        it('should track focusing errors if any occur', async () => {
          const lensData = lenses.map(l => l.data);
          const result = await applyLenses(epi, ips, lensData);
          
          expect(Array.isArray(result.focusingErrors)).toBe(true);
          // Log errors if any (for debugging)
          if (result.focusingErrors.length > 0) {
            console.log(`Focusing errors for ${epiName} + ${ipsName}:`, result.focusingErrors);
          }
        });

        it('should preserve composition section structure', async () => {
          const lensData = lenses.map(l => l.data);
          
          // Deep clone input ePI to avoid mutations affecting the test
          const inputEpi = JSON.parse(JSON.stringify(epi));
          const result = await applyLenses(inputEpi, ips, lensData);
          
          // Find composition in input and output
          const inputComposition = epi.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource;
          const outputComposition = result.epi.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource;
          
          expect(inputComposition).toBeDefined();
          expect(outputComposition).toBeDefined();
          
          // Both should have sections
          expect(inputComposition.section).toBeDefined();
          expect(outputComposition.section).toBeDefined();
          expect(Array.isArray(inputComposition.section)).toBe(true);
          expect(Array.isArray(outputComposition.section)).toBe(true);
          
          // Recursive function to validate section structure at all levels
          const validateSectionStructure = (inputSection: any, outputSection: any, path: string = 'section') => {
            // Title should be preserved
            if (inputSection.title) {
              expect(outputSection.title).toBe(inputSection.title);
            }
            
            // Code should be preserved
            if (inputSection.code) {
              expect(outputSection.code).toEqual(inputSection.code);
            }
            
            // If input has subsections, recursively validate them
            if (inputSection.section && Array.isArray(inputSection.section)) {
              expect(outputSection.section).toBeDefined();
              expect(Array.isArray(outputSection.section)).toBe(true);
              expect(outputSection.section.length).toBe(inputSection.section.length);
              
              // Recursively validate each subsection
              inputSection.section.forEach((inputSubsection: any, subIndex: number) => {
                validateSectionStructure(
                  inputSubsection, 
                  outputSection.section[subIndex], 
                  `${path}[${subIndex}]`
                );
              });
            }
          };
          
          // Section structure should be preserved at all levels
          expect(outputComposition.section.length).toBe(inputComposition.section.length);
          
          // Validate each top-level section and all its nested subsections
          inputComposition.section.forEach((inputSection: any, index: number) => {
            validateSectionStructure(inputSection, outputComposition.section[index], `section[${index}]`);
          });
        });

        // Test each lens individually
        lenses.forEach(({ name: lensName, data: lens }) => {
          it(`should apply lens: ${lensName}`, async () => {
            const result = await applyLenses(epi, ips, [lens]);
            
            expect(result).toBeDefined();
            expect(result.epi).toBeDefined();
            expect(Array.isArray(result.focusingErrors)).toBe(true);
          });
        });

        it('should handle empty lens array gracefully', async () => {
          const result = await applyLenses(epi, ips, []);
          
          expect(result).toBeDefined();
          expect(result.epi).toBeDefined();
          expect(result.focusingErrors).toEqual([]);
        });
      });
    });
  });
});

describe('Lens Execution Environment - Edge Cases', () => {
  const { epis, ipsList, lenses } = discoverTestData();

  if (epis.length > 0 && ipsList.length > 0 && lenses.length > 0) {
    const sampleEpi = epis[0].data;
    const sampleIps = ipsList[0].data;
    const sampleLens = lenses[0].data;

    it('should handle invalid ePI gracefully', async () => {
      const invalidEpi = { resourceType: 'Invalid' };
      
      // Invalid ePI should throw an error or be handled
      await expect(async () => {
        await applyLenses(invalidEpi, sampleIps, [sampleLens]);
      }).rejects.toThrow();
    });

    it('should handle invalid IPS gracefully', async () => {
      const invalidIps = { resourceType: 'Invalid' };
      const result = await applyLenses(sampleEpi, invalidIps, [sampleLens]);
      
      expect(result).toBeDefined();
      // Should not crash, IPS is less critical
    });

    it('should handle invalid lens gracefully', async () => {
      const invalidLens = {
        resourceType: 'Library',
        identifier: [{ value: 'invalid-lens' }],
        content: [{ data: 'aW52YWxpZA==' }]
      }; // "invalid" in base64
      
      // Invalid lens should be captured in errors, not throw
      const result = await applyLenses(sampleEpi, sampleIps, [invalidLens]);
      
      expect(result).toBeDefined();
      expect(result.focusingErrors).toBeDefined();
      expect(result.focusingErrors.length).toBeGreaterThan(0);
      // Should contain error about the invalid lens
      if (result.focusingErrors[0]) {
        expect(result.focusingErrors[0].length).toBeGreaterThan(0);
      }
    });
  }
});

describe('Lens Execution Environment - Data Validation', () => {
  const { epis, ipsList, lenses } = discoverTestData();

  describe('ePI Validation', () => {
    epis.forEach(({ name, data }) => {
      it(`${name} should be a valid FHIR Bundle`, () => {
        expect(data.resourceType).toBe('Bundle');
        expect(data.entry).toBeDefined();
        expect(Array.isArray(data.entry)).toBe(true);
      });

      it(`${name} should contain a Composition resource`, () => {
        const composition = data.entry?.find((e: any) => e.resource?.resourceType === 'Composition');
        expect(composition).toBeDefined();
      });
    });
  });

  describe('IPS Validation', () => {
    ipsList.forEach(({ name, data }) => {
      it(`${name} should be a valid FHIR Bundle`, () => {
        expect(data.resourceType).toBe('Bundle');
        expect(data.entry).toBeDefined();
        expect(Array.isArray(data.entry)).toBe(true);
      });

      it(`${name} should contain a Patient resource`, () => {
        const patient = data.entry?.find((e: any) => e.resource?.resourceType === 'Patient');
        expect(patient).toBeDefined();
      });
    });
  });

  describe('Lens Validation', () => {
    lenses.forEach(({ name, data }) => {
      it(`${name} should be a valid FHIR Library resource`, () => {
        expect(data.resourceType).toBe('Library');
        expect(Array.isArray(data.identifier)).toBe(true);
        expect(data.identifier.length).toBeGreaterThan(0);
        expect(typeof data.identifier[0].value).toBe('string');
        expect(data.identifier[0].value.length).toBeGreaterThan(0);
        expect(data.content).toBeDefined();
        expect(Array.isArray(data.content)).toBe(true);
      });

      it(`${name} should have base64-encoded JavaScript content`, () => {
        expect(data.content[0]).toBeDefined();
        expect(data.content[0].data).toBeDefined();
        expect(typeof data.content[0].data).toBe('string');
        
        // Try to decode base64
        expect(() => {
          Buffer.from(data.content[0].data, 'base64').toString('utf-8');
        }).not.toThrow();
      });
    });
  });
});

describe('Lens Execution Environment - Malicious Lens Handling', () => {
  const sampleEpi = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-data/epis/sample-epi-1.json'), 'utf8'));
  const sampleIps = JSON.parse(fs.readFileSync(path.join(__dirname, '../test-data/ips/sample-ips-1.json'), 'utf8'));

  it('should handle lens that throws an error', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-throws-error-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBeGreaterThan(0);
    // Should contain error about the thrown error
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    expect(result.focusingErrors[0][0].message).toContain('intentionally throws');
  });

  it('should handle lens with syntax errors', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-syntax-error-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBeGreaterThan(0);
    // Should contain error about syntax
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
  });

  it('should handle lens that returns null', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-returns-null-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    // May or may not generate errors depending on implementation
    // But should not crash
  });

  it('should handle lens that returns wrong type (string instead of object)', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-returns-string-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    // Should handle gracefully
  });

  it('should handle lens that accesses undefined properties deeply', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-accesses-undefined-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBeGreaterThan(0);
    // Should contain error about undefined access
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
  });

  it('should handle lens that modifies input data directly', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-modifies-input-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    
    // Verify original ePI is not modified (if LEE implements protection)
    // This test documents current behavior
    expect(result).toBeDefined();
  });

  it('should handle lens that returns nothing (undefined)', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-no-return-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    // Should handle gracefully when lens returns undefined
  });

  it('should handle multiple malicious lenses in sequence', async () => {
    const maliciousLens1 = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-throws-error-lens.json'), 'utf8')
    );
    const maliciousLens2 = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-returns-null-lens.json'), 'utf8')
    );
    const maliciousLens3 = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-accesses-undefined-lens.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens1, maliciousLens2, maliciousLens3]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBe(3);
    // All three lenses should be attempted even if earlier ones fail
  });

  it('should recover and apply valid lens after malicious lens', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-throws-error-lens.json'), 'utf8')
    );
    const validLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/sample-lens-1.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens, validLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBe(2);
    
    // First lens should have errors
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    
    // Second lens should succeed (empty errors)
    expect(result.focusingErrors[1].length).toBe(0);
  });

  it('should timeout infinite loop lens with default timeout (using Worker Threads)', async () => {
    const infiniteLoopLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-infinite-loop-lens.json'), 'utf8')
    );

    // Worker Threads can interrupt blocking infinite loops
    const result = await applyLenses(sampleEpi, sampleIps, [infiniteLoopLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBe(1);
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    expect(result.focusingErrors[0][0].message).toContain('timed out');
  }, 5000); // 5 second timeout for the test itself

  it('should respect custom timeout configuration with infinite loop (using Worker Threads)', async () => {
    const infiniteLoopLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-infinite-loop-lens.json'), 'utf8')
    );

    // Use very short timeout (100ms)
    const result = await applyLenses(sampleEpi, sampleIps, [infiniteLoopLens], undefined, { lensExecutionTimeout: 100 });
    
    expect(result).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBe(1);
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    expect(result.focusingErrors[0][0].message).toContain('timed out');
    expect(result.focusingErrors[0][0].message).toContain('100ms');
  }, 3000); // 3 second timeout for the test itself
  
  it('should timeout long-running async operations', async () => {
    // Create a lens that uses async delay (which DOES respect timeouts)
    const slowAsyncLensCode = `
      return {
        enhance: async function() {
          // Simulate long async operation
          await new Promise(resolve => setTimeout(resolve, 5000));
          return html;
        }
      };
    `;
    const slowAsyncLens = {
      resourceType: 'Library',
      id: 'slow-async-lens',
      identifier: [{ value: 'slow-async-lens' }],
      meta: { profile: ['http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/lens'] },
      extension: [{ url: 'http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/lee-version', valueString: '0.0.4' }],
      url: 'http://test.example/slow-async',
      version: '1.0.0',
      name: 'SlowAsyncLens',
      status: 'active',
      type: { coding: [{ code: 'logical-library' }] },
      content: [{ contentType: 'application/javascript', data: Buffer.from(slowAsyncLensCode).toString('base64') }]
    };

    // Should timeout after 100ms (much less than the 5000ms delay)
    const result = await applyLenses(sampleEpi, sampleIps, [slowAsyncLens], undefined, { lensExecutionTimeout: 100 });
    
    expect(result).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors.length).toBe(1);
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    expect(result.focusingErrors[0][0].message).toContain('timed out');
  }, 3000);

  it('should report missing identifier before execution and continue with next lens', async () => {
    const noIdentifierLensCode = `
      return {
        enhance: () => {
          throw new Error('This should not execute without identifier');
        }
      };
    `;

    const noIdentifierLens = {
      resourceType: 'Library',
      id: 'no-identifier-lens',
      name: 'NoIdentifierLens',
      status: 'active',
      type: { coding: [{ code: 'logical-library' }] },
      content: [{ contentType: 'application/javascript', data: Buffer.from(noIdentifierLensCode).toString('base64') }]
    };

    const validLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/sample-lens-1.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [noIdentifierLens, validLens]);

    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors.length).toBe(2);

    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    expect(result.focusingErrors[0][0].lensName).toBe('Invalid-Identifier');
    expect(result.focusingErrors[0][0].message).toContain('no valid identifier');

    expect(result.focusingErrors[1].length).toBe(0);
  });

  it('should use the first identifier when a lens has multiple identifiers', async () => {
    const multiIdentifierLensCode = `
      return {
        enhance: () => html + '<!-- modified -->',
        explanation: () => 'Multi identifier lens explanation'
      };
    `;

    const multiIdentifierLens = {
      resourceType: 'Library',
      id: 'multi-identifier-lens',
      identifier: [
        { value: 'first-identifier' },
        { value: 'second-identifier' }
      ],
      name: 'MultiIdentifierLens',
      status: 'active',
      type: { coding: [{ code: 'logical-library' }] },
      content: [{ contentType: 'application/javascript', data: Buffer.from(multiIdentifierLensCode).toString('base64') }]
    };

    const result = await applyLenses(sampleEpi, sampleIps, [multiIdentifierLens]);

    expect(result).toBeDefined();
    expect(result.focusingErrors.length).toBe(1);
    expect(result.focusingErrors[0].length).toBe(0);

    const compositionEntry = result.epi.entry.find((e: any) => e.resource?.resourceType === 'Composition');
    const composition = compositionEntry?.resource;
    const extensions = composition?.extension || [];
    const lensesAppliedExtensions = extensions.filter((ext: any) =>
      ext.url === 'http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied'
    );

    const lensesAppliedExtension = lensesAppliedExtensions.find((ext: any) => {
      const explanation = ext.extension?.find((e: any) => e.url === 'explanation');
      return explanation?.valueString === 'Multi identifier lens explanation';
    });

    expect(lensesAppliedExtension).toBeDefined();

    const lensReference = lensesAppliedExtension.extension.find((e: any) => e.url === 'lens');
    const elementClass = lensesAppliedExtension.extension.find((e: any) => e.url === 'elementClass');

    expect(lensReference?.valueCodeableReference?.reference?.reference).toBe('Library/first-identifier');
    expect(elementClass?.valueString).toBe('first-identifier');
  });
});

describe('Lens Execution Environment - LensesApplied extension tracking', () => {
  const sampleEpi = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/epis/sample-epi-1.json'), 'utf8')
  );
  const sampleIps = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/ips/sample-ips-1.json'), 'utf8')
  );

  const buildLens = (lensId: string, code: string) => ({
    resourceType: 'Library',
    identifier: [{ value: lensId }],
    name: lensId,
    status: 'active',
    type: { coding: [{ code: 'logical-library' }] },
    content: [{ contentType: 'application/javascript', data: Buffer.from(code).toString('base64') }]
  });

  const buildChangingLens = (lensId: string) => buildLens(
    lensId,
    `
return {
  enhance: () => html + '<!-- ${lensId} applied -->',
  explanation: () => '${lensId} explanation'
};
    `
  );

  const buildNoChangeLens = (lensId: string) => buildLens(
    lensId,
    `
return {
  enhance: () => html,
  explanation: () => '${lensId} no-op'
};
    `
  );

  const getAppliedLensIds = (epi: any): string[] => {
    const composition = epi.entry?.find((e: any) => e.resource?.resourceType === 'Composition')?.resource;
    const extensions = composition?.extension || [];
    const appliedExtensions = extensions.filter(
      (ext: any) => ext.url === 'http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/LensesApplied'
    );

    return appliedExtensions
      .map((ext: any) => ext.extension?.find((item: any) => item.url === 'lens')?.valueCodeableReference?.reference?.reference)
      .filter((reference: string | undefined) => typeof reference === 'string')
      .map((reference: string) => reference.replace('Library/', ''));
  };

  it('should list all lenses in extension when all lenses make changes', async () => {
    const lenses = [
      buildChangingLens('change-lens-1'),
      buildChangingLens('change-lens-2'),
      buildChangingLens('change-lens-3')
    ];

    const result = await applyLenses(JSON.parse(JSON.stringify(sampleEpi)), sampleIps, lenses);

    expect(result.focusingErrors.length).toBe(3);
    result.focusingErrors.forEach((lensErrors: any[]) => expect(lensErrors.length).toBe(0));
    expect(getAppliedLensIds(result.epi)).toEqual(['change-lens-1', 'change-lens-2', 'change-lens-3']);
  });

  it('should list only lenses that made changes when some lenses are no-op', async () => {
    const lenses = [
      buildChangingLens('change-lens-1'),
      buildNoChangeLens('no-change-lens'),
      buildChangingLens('change-lens-2')
    ];

    const result = await applyLenses(JSON.parse(JSON.stringify(sampleEpi)), sampleIps, lenses);

    expect(result.focusingErrors.length).toBe(3);
    result.focusingErrors.forEach((lensErrors: any[]) => expect(lensErrors.length).toBe(0));
    expect(getAppliedLensIds(result.epi)).toEqual(['change-lens-1', 'change-lens-2']);
  });

  it('should not list any lenses in extension when no lenses make changes', async () => {
    const lenses = [
      buildNoChangeLens('no-change-lens-1'),
      buildNoChangeLens('no-change-lens-2')
    ];

    const result = await applyLenses(JSON.parse(JSON.stringify(sampleEpi)), sampleIps, lenses);

    expect(result.focusingErrors.length).toBe(2);
    result.focusingErrors.forEach((lensErrors: any[]) => expect(lensErrors.length).toBe(0));
    expect(getAppliedLensIds(result.epi)).toEqual([]);
  });
});

describe('Configuration', () => {
  const sampleEpi = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/epis/sample-epi-1.json'), 'utf8')
  );
  const sampleIps = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/ips/sample-ips-1.json'), 'utf8')
  );
  
  it('should provide default configuration via getDefaultConfig', async () => {
    const { getDefaultConfig } = await import('./executor');
    const defaultConfig = getDefaultConfig();
    
    expect(defaultConfig).toBeDefined();
    expect(defaultConfig.lensExecutionTimeout).toBe(1000);
  });

  it('should be backwards compatible (work without config parameter)', async () => {
    const validLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/sample-lens-1.json'), 'utf8')
    );

    // Call without config parameter
    const result = await applyLenses(sampleEpi, sampleIps, [validLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
  });

  it('should merge custom config with defaults', async () => {
    const validLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/sample-lens-1.json'), 'utf8')
    );

    // Call with custom timeout
    const result = await applyLenses(sampleEpi, sampleIps, [validLens], undefined, { lensExecutionTimeout: 5000 });
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    // Should work fine with longer timeout
  });
});

describe('Persona Vector (PV) Support', () => {
  const sampleEpi = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/epis/sample-epi-1.json'), 'utf8')
  );
  const sampleIps = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/ips/sample-ips-1.json'), 'utf8')
  );
  const personaDimensionCollection = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/pv/Bundle-persona-dimension-collection.json'), 'utf8')
  );
  const pedroDimensionCollection = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/pv/Bundle-pedro-dimension-collection.json'), 'utf8')
  );
  const pvReaderLens = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../test-data/lenses/pv-reader-lens.json'), 'utf8')
  );

  it('should accept pv parameter without errors', async () => {
    const validLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/sample-lens-1.json'), 'utf8')
    );

    const result = await applyLenses(sampleEpi, sampleIps, [validLens], personaDimensionCollection);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
  });

  it('should work without pv parameter (backwards compatibility)', async () => {
    const validLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/sample-lens-1.json'), 'utf8')
    );

    // Call without pv
    const result = await applyLenses(sampleEpi, sampleIps, [validLens]);
    
    expect(result).toBeDefined();
    expect(result.epi).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
  });

  it('should pass pv data to lens - lens can read pv.entry', async () => {
    // Use the PV reader lens which checks for pv.entry
    const result = await applyLenses(sampleEpi, sampleIps, [pvReaderLens], personaDimensionCollection);
    
    expect(result).toBeDefined();
    expect(result.focusingErrors[0].length).toBe(0);
    
    // The test succeeds if the lens executed without errors and the pv data was accessible
    // The PV reader lens will throw an error if pv is not accessible
    expect(result.epi).toBeDefined();
  });

  it('should handle absence of pv gracefully - lens receives undefined', async () => {
    // Call without pv - the lens should handle undefined pv
    const result = await applyLenses(sampleEpi, sampleIps, [pvReaderLens]);
    
    expect(result).toBeDefined();
    expect(result.focusingErrors[0].length).toBe(0);
    
    // The lens successfully handled undefined pv without errors
    expect(result.epi).toBeDefined();
  });

  it('should access pv entry count correctly', async () => {
    const result = await applyLenses(sampleEpi, sampleIps, [pvReaderLens], personaDimensionCollection);
    
    // Check the explanation mentions the correct number of dimensions
    const composition = result.epi.entry.find((e: any) => e.resource.resourceType === 'Composition');
    const extensions = composition.resource.extension || [];
    const lensExtension = extensions.find((ext: any) => 
      ext.extension && ext.extension.some((e: any) => e.url === 'explanation')
    );
    
    if (lensExtension) {
      const explanationExt = lensExtension.extension.find((e: any) => e.url === 'explanation');
      if (explanationExt && explanationExt.valueMarkdown) {
        expect(explanationExt.valueMarkdown).toContain('persona dimensions');
      }
    }
    // If no explanation extension exists, verify pv was at least passed
    expect(result.focusingErrors[0].length).toBe(0);
  });

  it('should work with different pv bundles', async () => {
    // Test with Pedro's dimension collection
    const result = await applyLenses(sampleEpi, sampleIps, [pvReaderLens], pedroDimensionCollection);
    
    expect(result).toBeDefined();
    expect(result.focusingErrors[0].length).toBe(0);
    expect(result.epi).toBeDefined();
    
    // Different PV bundle was successfully accessed by the lens
  });

  it('should pass both pv and config parameters correctly', async () => {
    const result = await applyLenses(
      sampleEpi, 
      sampleIps, 
      [pvReaderLens], 
      personaDimensionCollection, 
      { lensExecutionTimeout: 2000 }
    );
    
    expect(result).toBeDefined();
    expect(result.focusingErrors[0].length).toBe(0);
    expect(result.epi).toBeDefined();
    
    // Both pv and config were passed correctly
  });

  it('should validate pv bundles have expected structure', () => {
    // Validate persona dimension collection structure
    expect(personaDimensionCollection.resourceType).toBe('Bundle');
    expect(personaDimensionCollection.type).toBe('collection');
    expect(personaDimensionCollection.meta.profile).toContain(
      'http://hl7.eu/fhir/ig/gravitate-health/StructureDefinition/persona-collection'
    );
    expect(Array.isArray(personaDimensionCollection.entry)).toBe(true);
    expect(personaDimensionCollection.entry.length).toBeGreaterThan(0);
    
    // Validate Pedro dimension collection structure
    expect(pedroDimensionCollection.resourceType).toBe('Bundle');
    expect(pedroDimensionCollection.type).toBe('collection');
    expect(Array.isArray(pedroDimensionCollection.entry)).toBe(true);
  });

  it('should allow lenses to read persona dimension observations', async () => {
    // Create a lens that specifically reads observation codes from pv
    const pvObservationReaderCode = `
return {
  enhance: () => {
    if (pv && pv.entry && pv.entry.length > 0) {
      // Count observations with specific codes
      const observations = pv.entry.filter(e => e.resource && e.resource.resourceType === 'Observation');
      const marker = \`<!-- Found \${observations.length} Observations in PV -->\`;
      return marker + "\\n" + html;
    }
    return html;
  },
  explanation: () => {
    if (pv && pv.entry) {
      const observations = pv.entry.filter(e => e.resource && e.resource.resourceType === 'Observation');
      return \`Analyzed \${observations.length} persona observations\`;
    }
    return "";
  }
};
    `;
    
    const pvObservationLens = {
      resourceType: 'Library',
      identifier: [{ value: 'pv-observation-reader-lens' }],
      url: 'http://test.example/pv-observation-reader',
      version: '1.0.0',
      name: 'PVObservationReaderLens',
      status: 'active',
      type: { coding: [{ code: 'logical-library' }] },
      content: [{ 
        contentType: 'application/javascript', 
        data: Buffer.from(pvObservationReaderCode).toString('base64') 
      }]
    };

    const result = await applyLenses(sampleEpi, sampleIps, [pvObservationLens], personaDimensionCollection);
    
    expect(result).toBeDefined();
    expect(result.focusingErrors[0].length).toBe(0);
    expect(result.epi).toBeDefined();
    
    // The lens successfully read the Observation resources from pv.entry
  });
});
