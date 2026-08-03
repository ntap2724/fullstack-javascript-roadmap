import { z } from 'zod';
import { ArtifactIdSchema, CompetencyIdSchema } from '@roadmap/curriculum-schema';

const ScoreSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const RubricArtifactIdSchema = ArtifactIdSchema.regex(
  /^rubric-/,
  'Rubric IDs must use the canonical rubric artifact family',
);

export const CriterionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);

export const rubricEvidenceReferences = [
  'test-report',
  'source-diff',
  'explanation',
  'observation-report',
  'debugging-report',
] as const;

export const EvidenceReferenceSchema = z.enum(rubricEvidenceReferences);

const CriterionSchema = z
  .object({
    id: CriterionIdSchema,
    title: z.string().min(1),
    critical: z.boolean(),
    required: z.boolean(),
    competency: CompetencyIdSchema,
    evidence: z.array(EvidenceReferenceSchema).min(1),
    levels: z
      .object({
        '0': z.string().min(1),
        '1': z.string().min(1),
        '2': z.string().min(1),
        '3': z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const RubricSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: RubricArtifactIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    title: z.string().min(1),
    criteria: z.array(CriterionSchema).min(1),
  })
  .strict()
  .superRefine((rubric, context) => {
    const criterionIds = rubric.criteria.map((criterion) => criterion.id);
    if (new Set(criterionIds).size !== criterionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['criteria'],
        message: 'Criterion IDs must be unique',
      });
    }
  });

export const RubricSubmissionSchema = z
  .object({
    rubricId: RubricArtifactIdSchema,
    rubricVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    scores: z.record(CriterionIdSchema, ScoreSchema),
  })
  .strict();

export type Rubric = z.infer<typeof RubricSchema>;
export type RubricSubmission = z.infer<typeof RubricSubmissionSchema>;
export type RubricScore = z.infer<typeof ScoreSchema>;
