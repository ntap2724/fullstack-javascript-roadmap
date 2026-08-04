import type { RubricEvaluation } from '@roadmap/rubric-schema';
import type { RemediationCatalog } from './remediation.js';

export interface AssessmentResult {
  status: RubricEvaluation['status'];
  blocking: readonly RemediationCatalog['entries'][number][];
}

export function createAssessmentResult(
  evaluation: RubricEvaluation,
  catalog: RemediationCatalog,
): AssessmentResult {
  const entriesByCriterion = new Map(catalog.entries.map((entry) => [entry.criterion, entry]));
  const blocking = evaluation.blockingCriterionIds.map((criterionId) => {
    const entry = entriesByCriterion.get(criterionId);
    if (entry === undefined) {
      throw new Error('No remediation entry for blocking criterion ' + criterionId);
    }
    return entry;
  });

  return { status: evaluation.status, blocking };
}
