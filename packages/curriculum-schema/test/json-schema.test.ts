import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateCurriculumJsonSchema } from '../src/json-schema.js';

describe('generated JSON Schema', () => {
  it('matches the canonical Zod schema exactly', async () => {
    const committed: unknown = JSON.parse(
      await readFile(new URL('../generated/curriculum.schema.json', import.meta.url), 'utf8'),
    );
    expect(committed).toEqual(generateCurriculumJsonSchema());
  });
});
