import { executeLens, executeLenses, getProcessedHtml } from './executor';
import { Lens, PreprocessedEPI, IPS } from './types';

describe('executeLens', () => {
  const mockEpi: PreprocessedEPI = {
    id: 'test-epi',
    htmlContent: '<div>Original content</div>',
    metadata: { version: '1.0' },
  };

  const mockIps: IPS = {
    id: 'test-ips',
    patient: { name: 'John Doe', age: 30 },
    conditions: [{ code: 'diabetes' }],
    medications: [],
    allergies: [],
  };

  it('should successfully execute a simple lens', () => {
    const lens: Lens = {
      id: 'test-lens',
      name: 'Test Lens',
      lensFunction: `function(epi, ips) {
        return epi.htmlContent.replace('Original', 'Modified');
      }`,
    };

    const result = executeLens(lens, mockEpi, mockIps);

    expect(result.success).toBe(true);
    expect(result.result).toBe('<div>Modified content</div>');
    expect(result.lensId).toBe('test-lens');
  });

  it('should handle lens that uses IPS data', () => {
    const lens: Lens = {
      id: 'ips-lens',
      name: 'IPS Lens',
      lensFunction: `function(epi, ips) {
        const patientName = ips.patient?.name || 'Unknown';
        return epi.htmlContent + '<p>Patient: ' + patientName + '</p>';
      }`,
    };

    const result = executeLens(lens, mockEpi, mockIps);

    expect(result.success).toBe(true);
    expect(result.result).toBe('<div>Original content</div><p>Patient: John Doe</p>');
  });

  it('should handle lens execution errors gracefully', () => {
    const lens: Lens = {
      id: 'error-lens',
      name: 'Error Lens',
      lensFunction: `function(epi, ips) {
        throw new Error('Intentional error');
      }`,
    };

    const result = executeLens(lens, mockEpi, mockIps);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Intentional error');
    expect(result.lensId).toBe('error-lens');
  });

  it('should handle syntax errors in lens function', () => {
    const lens: Lens = {
      id: 'syntax-error-lens',
      name: 'Syntax Error Lens',
      lensFunction: `function(epi, ips { return epi.htmlContent; }`, // Missing closing parenthesis
    };

    const result = executeLens(lens, mockEpi, mockIps);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe('executeLenses', () => {
  const mockEpi: PreprocessedEPI = {
    id: 'test-epi',
    htmlContent: '<div>Content</div>',
  };

  const mockIps: IPS = {
    id: 'test-ips',
  };

  it('should execute multiple lenses in sequence', () => {
    const lenses: Lens[] = [
      {
        id: 'lens-1',
        name: 'Lens 1',
        lensFunction: `function(epi, ips) {
          return epi.htmlContent.replace('Content', 'First');
        }`,
      },
      {
        id: 'lens-2',
        name: 'Lens 2',
        lensFunction: `function(epi, ips) {
          return epi.htmlContent.replace('First', 'Second');
        }`,
      },
    ];

    const results = executeLenses(lenses, mockEpi, mockIps);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].result).toBe('<div>First</div>');
    expect(results[1].success).toBe(true);
    expect(results[1].result).toBe('<div>Second</div>');
  });

  it('should continue on error by default', () => {
    const lenses: Lens[] = [
      {
        id: 'lens-1',
        name: 'Lens 1',
        lensFunction: `function(epi, ips) {
          throw new Error('Error in lens 1');
        }`,
      },
      {
        id: 'lens-2',
        name: 'Lens 2',
        lensFunction: `function(epi, ips) {
          return epi.htmlContent + ' - modified';
        }`,
      },
    ];

    const results = executeLenses(lenses, mockEpi, mockIps);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });

  it('should stop on error when continueOnError is false', () => {
    const lenses: Lens[] = [
      {
        id: 'lens-1',
        name: 'Lens 1',
        lensFunction: `function(epi, ips) {
          throw new Error('Error in lens 1');
        }`,
      },
      {
        id: 'lens-2',
        name: 'Lens 2',
        lensFunction: `function(epi, ips) {
          return epi.htmlContent + ' - modified';
        }`,
      },
    ];

    const results = executeLenses(lenses, mockEpi, mockIps, { continueOnError: false });

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
  });
});

describe('getProcessedHtml', () => {
  const mockEpi: PreprocessedEPI = {
    id: 'test-epi',
    htmlContent: '<div>Original</div>',
  };

  const mockIps: IPS = {
    id: 'test-ips',
  };

  it('should return processed HTML from successful lenses', () => {
    const lenses: Lens[] = [
      {
        id: 'lens-1',
        name: 'Lens 1',
        lensFunction: `function(epi, ips) {
          return epi.htmlContent.replace('Original', 'Processed');
        }`,
      },
    ];

    const result = getProcessedHtml(lenses, mockEpi, mockIps);

    expect(result).toBe('<div>Processed</div>');
  });

  it('should return original content if all lenses fail', () => {
    const lenses: Lens[] = [
      {
        id: 'lens-1',
        name: 'Lens 1',
        lensFunction: `function(epi, ips) {
          throw new Error('Error');
        }`,
      },
    ];

    const result = getProcessedHtml(lenses, mockEpi, mockIps);

    expect(result).toBe('<div>Original</div>');
  });

  it('should return last successful result when some lenses fail', () => {
    const lenses: Lens[] = [
      {
        id: 'lens-1',
        name: 'Lens 1',
        lensFunction: `function(epi, ips) {
          return '<div>Success</div>';
        }`,
      },
      {
        id: 'lens-2',
        name: 'Lens 2',
        lensFunction: `function(epi, ips) {
          throw new Error('Error in lens 2');
        }`,
      },
    ];

    const result = getProcessedHtml(lenses, mockEpi, mockIps);

    expect(result).toBe('<div>Success</div>');
  });
});
