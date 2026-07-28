import { z } from 'zod';
import { ArtifactIdSchema, CompetencyIdSchema } from './ids.js';
import { CommonArtifactFields, MasteryLevelSchema } from './common.js';

export const TrackSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('track'),
    requiredCompetencies: z.array(CompetencyIdSchema),
    modules: z.array(ArtifactIdSchema),
  })
  .strict();

export const CompetencySchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('competency'),
    id: CompetencyIdSchema,
    slug: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(['draft', 'review', 'published', 'deprecated', 'withdrawn']),
    prerequisites: z.array(CompetencyIdSchema).default([]),
    requiredLevel: MasteryLevelSchema,
    assessments: z.array(ArtifactIdSchema).min(1),
    remediation: z.array(ArtifactIdSchema).min(1),
    introducedIn: z.string().regex(/^\d+\.\d+\.\d+$/),
    lastReviewedIn: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict();

export const ModuleSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('module'),
    competencies: z.array(CompetencyIdSchema).min(1),
    lessons: z.array(ArtifactIdSchema).min(1),
    milestone: ArtifactIdSchema.optional(),
  })
  .strict();

export const LessonSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('lesson'),
    module: ArtifactIdSchema,
    competencies: z.array(CompetencyIdSchema).min(1),
    exercises: z.array(ArtifactIdSchema).default([]),
    assessments: z.array(ArtifactIdSchema).default([]),
    sourceLanguage: z.literal('vi'),
    professionalArtifactLanguage: z.literal('en'),
  })
  .strict();

export const AssessmentSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('assessment'),
    assessmentType: z.enum([
      'knowledge-check',
      'focused-exercise',
      'mechanism-lab',
      'debugging-task',
      'change-request',
      'milestone-project',
    ]),
    competencies: z.array(CompetencyIdSchema).min(1),
    artifact: ArtifactIdSchema.optional(),
  })
  .strict();

export const MilestoneSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('milestone'),
    competencies: z.array(CompetencyIdSchema).min(1),
    project: ArtifactIdSchema,
    rubric: ArtifactIdSchema,
    evidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const CurriculumEntitySchema = z.discriminatedUnion('kind', [
  TrackSchema,
  CompetencySchema,
  ModuleSchema,
  LessonSchema,
  AssessmentSchema,
  MilestoneSchema,
]);

export type CurriculumEntity = z.infer<typeof CurriculumEntitySchema>;
