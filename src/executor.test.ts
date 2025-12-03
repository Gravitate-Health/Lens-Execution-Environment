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

  const files = fs.readdirSync(directory).filter(f => f.endsWith('.json'));
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
      
      // Invalid lens should throw or be captured in errors
      await expect(async () => {
        await applyLenses(sampleEpi, sampleIps, [invalidLens]);
      }).rejects.toThrow();
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
