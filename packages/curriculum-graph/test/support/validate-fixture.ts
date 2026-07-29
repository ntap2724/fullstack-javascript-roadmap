import path from 'node:path';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import type { ValidationOutcome } from '@roadmap/validation-core';
import { buildCurriculumGraph } from '../../src/index.js';
import { validateCurriculumGraph } from '../../src/validate.js';
import type { CurriculumGraph } from '../../src/types.js';

const fixturesRoot = path.resolve(import.meta.dirname, '../../../../fixtures/curriculum');

/**
 * Loads, builds, and validates one named curriculum fixture without mutating it.
 */
export async function validateFixture(
  relativeFixturePath: string,
): Promise<ValidationOutcome<CurriculumGraph>> {
  const loadOutcome = await loadCurriculum(path.join(fixturesRoot, relativeFixturePath));
  if (!loadOutcome.ok) {
    return loadOutcome;
  }

  const graphOutcome = buildCurriculumGraph(loadOutcome.value);
  if (!graphOutcome.ok) {
    return graphOutcome;
  }

  return validateCurriculumGraph(graphOutcome.value);
}
