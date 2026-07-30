import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('curriculum source ownership', () => {
  it('does not contain a hand-maintained src/content/docs directory', async () => {
    await expect(access(new URL('../src/content/docs', import.meta.url))).rejects.toThrow();
  });
});
