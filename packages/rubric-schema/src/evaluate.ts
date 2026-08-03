import {
  RubricSubmissionSchema,
  type Rubric,
  type RubricScore,
  type RubricSubmission,
} from './schema.js';

interface CriterionResult {
  criterionId: string;
  critical: boolean;
  required: boolean;
  score: RubricScore | null;
  status: 'passed' | 'failed' | 'missing';
}

export interface RubricEvaluation {
  status: 'passed' | 'needs-remediation';
  criteria: readonly CriterionResult[];
  blockingCriterionIds: readonly string[];
}

export function evaluateRubric(
  rubric: Rubric,
  submissionInput: RubricSubmission,
): RubricEvaluation {
  const submission = RubricSubmissionSchema.parse(submissionInput);
  if (submission.rubricId !== rubric.id || submission.rubricVersion !== rubric.version) {
    throw new Error(
      `Rubric submission targets ${submission.rubricId}@${submission.rubricVersion}, expected ${rubric.id}@${rubric.version}`,
    );
  }
  const knownCriterionIds = new Set(rubric.criteria.map((criterion) => criterion.id));
  const unknownCriterionIds = Object.keys(submission.scores)
    .filter((criterionId) => !knownCriterionIds.has(criterionId))
    .sort();
  if (unknownCriterionIds.length > 0) {
    throw new Error(`Unknown rubric criterion: ${unknownCriterionIds.join(', ')}`);
  }
  const criteria = rubric.criteria.map((criterion): CriterionResult => {
    const score = submission.scores[criterion.id] ?? null;
    const status = score === null ? 'missing' : score >= 2 ? 'passed' : 'failed';

    return {
      criterionId: criterion.id,
      critical: criterion.critical,
      required: criterion.required,
      score,
      status,
    };
  });
  const blockingCriterionIds = criteria
    .filter(
      (criterion) => (criterion.critical || criterion.required) && criterion.status !== 'passed',
    )
    .map((criterion) => criterion.criterionId);

  return {
    status: blockingCriterionIds.length === 0 ? 'passed' : 'needs-remediation',
    criteria,
    blockingCriterionIds,
  };
}
