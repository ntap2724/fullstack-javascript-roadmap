import { z } from 'zod';
import { isSafeRelativePath, isValidEditablePattern } from './paths.js';

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const CompetencyIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/);
const ExerciseIdSchema = z.string().regex(/^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const NonNulStringSchema = z
  .string()
  .refine((value) => !value.includes('\0'), 'NUL is not allowed');
const RelativePathSchema = NonNulStringSchema.min(1).refine(
  isSafeRelativePath,
  'Path must stay within the exercise root',
);
const CommandCwdSchema = NonNulStringSchema.refine(
  (input) => input === '.' || isSafeRelativePath(input),
  'Command cwd must be the semantic workspace root or a safe relative directory',
);
const TimeoutSchema = z
  .number()
  .refine(Number.isFinite, 'Timeout must be finite')
  .int()
  .positive()
  .max(15 * 60_000);

export const MasteryLevelSchema = z.enum([
  'recognize',
  'explain',
  'implement',
  'diagnose',
  'design-and-justify',
]);

export const ExerciseTypeSchema = z.enum([
  'focused-exercise',
  'mechanism-lab',
  'debugging-task',
  'refactoring-task',
  'change-request',
]);

export const ExerciseLanguageSchema = z.enum([
  'javascript',
  'typescript',
  'html-css',
  'sql',
  'mixed',
]);

export const EvidenceKindSchema = z.enum([
  'test-report',
  'source-diff',
  'explanation',
  'observation-report',
  'debugging-report',
]);

export const CommandDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    required: z.boolean(),
    command: NonNulStringSchema.min(1).refine(
      (value) => value.trim().length > 0,
      'Command name must not be blank',
    ),
    args: z.array(NonNulStringSchema),
    cwd: CommandCwdSchema,
    timeoutMs: TimeoutSchema,
  })
  .strict();

export const HintSchema = z
  .object({
    level: z.number().int().min(1).max(5),
    path: RelativePathSchema,
  })
  .strict();

export const ConstraintsSchema = z
  .object({
    editablePaths: z.array(NonNulStringSchema.min(1)).min(1),
    forbiddenDependencies: z.array(NonNulStringSchema),
    forbiddenApis: z.array(NonNulStringSchema),
  })
  .strict();

export const ExerciseDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: ExerciseIdSchema,
    version: SemverSchema,
    title: z.string().min(1),
    type: ExerciseTypeSchema,
    language: ExerciseLanguageSchema,
    competencies: z.array(CompetencyIdSchema).min(1),
    requiredLevel: z.record(CompetencyIdSchema, MasteryLevelSchema),
    prerequisites: z.array(CompetencyIdSchema),
    commands: z
      .object({
        baseline: z.array(CommandDefinitionSchema).min(1),
        learner: z.array(CommandDefinitionSchema).min(1),
      })
      .strict(),
    constraints: ConstraintsSchema,
    evidence: z.array(EvidenceKindSchema).min(1),
    hints: z.array(HintSchema).min(1),
  })
  .strict()
  .superRefine((definition, context) => {
    if (new Set(definition.competencies).size !== definition.competencies.length) {
      context.addIssue({
        code: 'custom',
        path: ['competencies'],
        message: 'Competency IDs must be unique',
      });
    }

    for (const competency of definition.competencies) {
      if (!(competency in definition.requiredLevel)) {
        context.addIssue({
          code: 'custom',
          path: ['requiredLevel', competency],
          message: 'Every declared competency must have a required level',
        });
      }
    }

    for (const competency of Object.keys(definition.requiredLevel)) {
      if (!definition.competencies.includes(competency)) {
        context.addIssue({
          code: 'custom',
          path: ['requiredLevel', competency],
          message: 'Required level must reference a declared competency',
        });
      }
    }

    for (const [index, pattern] of definition.constraints.editablePaths.entries()) {
      if (!isValidEditablePattern(pattern)) {
        context.addIssue({
          code: 'custom',
          path: ['constraints', 'editablePaths', index],
          message: 'Editable paths must use the allow-only pattern grammar',
        });
      }
    }

    if (definition.constraints.forbiddenDependencies.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['constraints', 'forbiddenDependencies'],
        message: 'Release 0 does not support non-empty forbidden dependency policy arrays',
      });
    }

    if (definition.constraints.forbiddenApis.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['constraints', 'forbiddenApis'],
        message: 'Release 0 does not support non-empty forbidden API policy arrays',
      });
    }

    const levels = definition.hints.map((hint) => hint.level);
    if (
      new Set(levels).size !== levels.length ||
      levels.some((level, index) => {
        const previous = levels[index - 1];
        return previous !== undefined && level <= previous;
      })
    ) {
      context.addIssue({
        code: 'custom',
        path: ['hints'],
        message: 'Hint levels must be unique and strictly increasing',
      });
    }
  });
