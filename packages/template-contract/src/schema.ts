import path from 'node:path';
import { z } from 'zod';

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const SafeRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.split(/[\\/]/).includes('..'),
    'Path must be relative and must not traverse parents',
  );
const SafeGlobSchema = SafeRelativePathSchema.refine(
  (value) => value !== '.',
  'Publication globs must select at least one path segment',
);

const CommandSchema = z
  .object({
    command: z
      .string()
      .min(1)
      .regex(
        /^[^&|;<>\r\n]+$/,
        'Command must be one executable token; pass arguments through args',
      ),
    args: z.array(z.string()),
    cwd: SafeRelativePathSchema,
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(20 * 60_000),
  })
  .strict();

export const TemplateDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^template-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    repositoryName: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    version: SemverSchema,
    curriculum: z
      .object({
        release: SemverSchema,
        entryPoint: z.string().regex(/^project-[a-z0-9]+(?:-[a-z0-9]+)*$/),
      })
      .strict(),
    runtime: z
      .object({
        nodeFamily: z.literal(24),
        packageManager: z.literal('pnpm'),
      })
      .strict(),
    publication: z
      .object({
        include: z.array(SafeGlobSchema).min(1),
        exclude: z.array(SafeGlobSchema),
        textTransforms: z.array(
          z
            .object({
              token: z.string().regex(/^\{\{[A-Z0-9_]+\}\}$/),
              valueFrom: z.enum(['template.version', 'curriculum.release']),
            })
            .strict(),
        ),
      })
      .strict(),
    verification: z
      .object({
        install: CommandSchema,
        baseline: CommandSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((definition, context) => {
    const tokens = definition.publication.textTransforms.map((transform) => transform.token);
    if (new Set(tokens).size !== tokens.length) {
      context.addIssue({
        code: 'custom',
        path: ['publication', 'textTransforms'],
        message: 'Transform tokens must be unique',
      });
    }
  });

export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;
