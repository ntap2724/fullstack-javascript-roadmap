import { ArtifactIdSchema, CompetencyIdSchema } from '@roadmap/curriculum-schema';
import { CriterionIdSchema } from '@roadmap/rubric-schema';
import { failure, success } from '@roadmap/validation-core';
import type { Rubric } from '@roadmap/rubric-schema';
import type { ValidationOutcome } from '@roadmap/validation-core';
import { z } from 'zod';

const LessonArtifactIdSchema = ArtifactIdSchema.regex(
  /^lesson-/,
  'Lesson IDs must use the canonical lesson artifact family',
);
const ExerciseArtifactIdSchema = ArtifactIdSchema.regex(
  /^ex-/,
  'Exercise IDs must use the canonical exercise artifact family',
);

export const RemediationCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    entries: z
      .array(
        z
          .object({
            criterion: CriterionIdSchema,
            competency: CompetencyIdSchema,
            lessons: z.array(LessonArtifactIdSchema),
            exercises: z.array(ExerciseArtifactIdSchema),
            retake: z.array(z.string().min(1)).min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((catalog, context) => {
    const criterionIds = catalog.entries.map((entry) => entry.criterion);
    if (new Set(criterionIds).size !== criterionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['entries'],
        message: 'One remediation entry per criterion is allowed',
      });
    }
  });

export type RemediationCatalog = z.infer<typeof RemediationCatalogSchema>;

export function validateRemediationCoverage(
  rubric: Rubric,
  catalog: RemediationCatalog,
): ValidationOutcome<void> {
  const coveredCriterionIds = new Set(catalog.entries.map((entry) => entry.criterion));
  const missingCriteria = rubric.criteria
    .filter(
      (criterion) =>
        (criterion.required || criterion.critical) && !coveredCriterionIds.has(criterion.id),
    )
    .sort((left, right) => {
      if (left.id === right.id) return 0;
      return left.id < right.id ? -1 : 1;
    });

  if (missingCriteria.length > 0) {
    return failure(
      missingCriteria.map((criterion) => ({
        code: 'ASSESSMENT_REMEDIATION_001',
        severity: 'error' as const,
        location: {
          file: rubric.id,
          pointer: '/criteria/' + criterion.id,
        },
        observed: criterion.id,
        expected: 'One remediation entry for every required or critical criterion',
        reason: 'A blocking rubric failure would have no deterministic recovery path',
        remediation: 'Add a remediation catalog entry for ' + criterion.id,
        documentation: 'docs/authoring/remediation.md',
      })),
    );
  }

  return success(undefined);
}
