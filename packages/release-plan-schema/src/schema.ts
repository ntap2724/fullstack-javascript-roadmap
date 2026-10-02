import path from 'node:path';
import { z } from 'zod';

const SafeRepositoryPathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.split(/[\\/]/).includes('..'),
    'Path must be repository-relative and contained',
  );

const CommandNameSchema = z
  .string()
  .min(1)
  .refine(
    (value) => !/[\s;&|`$<>\r\n\0]/.test(value),
    'Command must be one executable name without shell syntax or whitespace',
  );

export const ReleasePlanCommandSchema = z
  .object({
    command: CommandNameSchema,
    args: z.array(z.string()),
    cwd: SafeRepositoryPathSchema,
    timeoutMs: z.number().int().positive().max(1_800_000),
  })
  .strict();

export const WorkLaneSchema = z.enum([
  'governance',
  'engineering',
  'curriculum',
  'exercise',
  'frontend',
  'backend',
  'database',
  'fullstack',
  'assessment',
  'pilot',
]);

export const WorkRiskSchema = z.enum(['R0', 'R1', 'R2', 'R3', 'R4']);
export const ReviewKindSchema = z.enum([
  'architecture',
  'curriculum',
  'testing',
  'security',
  'release',
]);
export const CoverageRoleSchema = z.enum([
  'content',
  'assessment',
  'implementation',
  'test',
  'remediation',
]);

const CoverageTargetSchema = z
  .object({
    id: z.string().min(1),
    roles: z.array(CoverageRoleSchema).min(1),
  })
  .strict();

export const ReleasePlanItemSchema = z
  .object({
    id: z.string().regex(/^R1-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/),
    status: z.enum([
      'proposed',
      'ready',
      'in-progress',
      'blocked',
      'implemented',
      'verified',
      'merged',
      'withdrawn',
    ]),
    lane: WorkLaneSchema,
    risk: WorkRiskSchema,
    objective: z.string().min(12),
    specReferences: z.array(SafeRepositoryPathSchema).min(1),
    dependsOn: z.array(z.string().regex(/^R1-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/)),
    files: z.array(SafeRepositoryPathSchema).min(1),
    acceptance: z.array(ReleasePlanCommandSchema).min(1),
    review: z.array(ReviewKindSchema).min(1),
    evidence: z.array(z.string().min(1)).min(1),
    openQuestions: z.array(z.string().min(1)),
    coverage: z
      .object({
        competencies: z.array(z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/)),
        modules: z.array(CoverageTargetSchema),
        criteria: z.array(CoverageTargetSchema),
      })
      .strict(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.status === 'ready' && item.openQuestions.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['openQuestions'],
        message: 'Ready items have no unresolved questions',
      });
    }
    if (item.risk === 'R3' && !item.review.includes('architecture')) {
      context.addIssue({
        code: 'custom',
        path: ['review'],
        message: 'R3 requires architecture review',
      });
    }
    if (item.risk === 'R4' && !item.review.includes('security')) {
      context.addIssue({
        code: 'custom',
        path: ['review'],
        message: 'R4 requires security review',
      });
    }
  });

export const ReleasePlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseId: z.string().regex(/^release-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    items: z.array(ReleasePlanItemSchema).min(1),
  })
  .strict();

export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;
export type ReleasePlanItem = z.infer<typeof ReleasePlanItemSchema>;
