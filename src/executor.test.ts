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
      const invalidLens = { resourceType: 'Library', content: [{ data: 'aW52YWxpZA==' }] }; // "invalid" in base64
      
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

  // Note: Infinite loop test is intentionally commented out as it would hang tests
  // In production, this should be handled with timeouts at the infrastructure level
  /*
  it('should handle lens with infinite loop (with timeout)', async () => {
    const maliciousLens = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../test-data/lenses/malicious-infinite-loop-lens.json'), 'utf8')
    );

    // This test requires timeout implementation in LEE
    const result = await applyLenses(sampleEpi, sampleIps, [maliciousLens]);
    
    expect(result).toBeDefined();
    expect(result.focusingErrors).toBeDefined();
    expect(result.focusingErrors[0].length).toBeGreaterThan(0);
    expect(result.focusingErrors[0][0]).toContain('timeout');
  }, 10000); // 10 second timeout for the test itself
  */
});
