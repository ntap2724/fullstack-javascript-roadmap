import type { Diagnostic } from './diagnostic.js';

export function internalErrorDiagnostic(error: unknown, file = '<validator>'): Diagnostic {
  return {
    code: 'VALIDATOR_INTERNAL_001',
    severity: 'error',
    location: { file },
    observed: error instanceof Error ? error.message : String(error),
    expected: 'Validator completes without throwing',
    reason: 'An unexpected validator exception prevents a trustworthy result',
    remediation: 'Fix the validator and add a regression fixture before rerunning validation',
    documentation: 'docs/architecture/validation.md#validator-internal-errors',
  };
}
