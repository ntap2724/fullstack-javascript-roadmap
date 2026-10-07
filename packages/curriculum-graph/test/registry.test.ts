import { describe, expect, it } from 'vitest';
import { graphFixture } from './support/graph-fixture.js';

describe('stable-ID registry', () => {
  it('rejects duplicate IDs with both file locations', async () => {
    const outcome = await graphFixture('invalid/duplicate-id');
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CURRICULUM_ID_001' })]),
    );
  });

  it('rejects unresolved references', async () => {
    const outcome = await graphFixture('invalid/missing-reference');
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CURRICULUM_REFERENCE_001' })]),
    );
  });

  it('rejects a release whose exit gate does not resolve', async () => {
    const outcome = await graphFixture('invalid/release-missing-exit-gate');
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'CURRICULUM_REFERENCE_001' })]),
      );
    }
  });
});
