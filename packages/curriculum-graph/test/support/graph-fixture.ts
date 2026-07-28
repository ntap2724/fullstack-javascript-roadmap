import path from 'node:path';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import type { ValidationOutcome } from '@roadmap/validation-core';
import { buildCurriculumGraph } from '../../src/index.js';
import type { CurriculumGraph } from '../../src/types.js';

const fixturesRoot = path.resolve(import.meta.dirname, '../../../../fixtures/curriculum');

/**
 * Loads the named fixture directory (relative to fixtures/curriculum) and builds
 * a CurriculumGraph from it. Read-only: never mutates repository fixtures.
 */
export async function graphFixture(
  relativeFixturePath: string,
): Promise<ValidationOutcome<CurriculumGraph>> {
  const loadOutcome = await loadCurriculum(path.join(fixturesRoot, relativeFixturePath));
  if (!loadOutcome.ok) {
    return loadOutcome;
  }
  return buildCurriculumGraph(loadOutcome.value);
}
