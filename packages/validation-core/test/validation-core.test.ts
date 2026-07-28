import { describe, expect, it } from 'vitest';
import {
  failure,
  hasErrors,
  internalErrorDiagnostic,
  mergeDiagnostics,
  success,
} from '../src/index.js';

describe('validation outcomes', () => {
  it('preserves warnings on successful values', () => {
    const warning = {
      code: 'TEST_WARNING_001',
      severity: 'warning' as const,
      location: { file: 'fixture.yml' },
      observed: 'old',
      expected: 'new',
      reason: 'The fixture is intentionally old',
      remediation: 'Update the fixture',
      documentation: 'docs/validation.md',
    };
    expect(success(42, [warning])).toEqual({ ok: true, value: 42, diagnostics: [warning] });
  });

  it('detects error severity independently of warning count', () => {
    expect(hasErrors([{ ...internalErrorDiagnostic(new Error('boom')), severity: 'error' }])).toBe(
      true,
    );
  });

  it('deduplicates identical diagnostics while preserving order', () => {
    const diagnostic = internalErrorDiagnostic(new Error('boom'));
    expect(mergeDiagnostics([diagnostic], [diagnostic])).toEqual([diagnostic]);
  });

  it('creates a failed outcome with no value', () => {
    const diagnostic = internalErrorDiagnostic(new Error('boom'));
    expect(failure([diagnostic])).toEqual({ ok: false, diagnostics: [diagnostic] });
  });
});
