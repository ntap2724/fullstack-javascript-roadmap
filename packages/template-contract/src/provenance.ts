import { z } from 'zod';

export const TemplateProvenanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string().regex(/^template-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    templateVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    curriculumVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    sourceRepository: z.string().min(1),
    sourceCommit: z.string().regex(/^[0-9a-f]{40}$/),
    generatedAt: z.iso.datetime({ offset: true }),
    toolchain: z
      .object({
        node: z.string().regex(/^24\.\d+\.\d+$/),
        pnpm: z.string().regex(/^\d+\.\d+\.\d+$/),
      })
      .strict(),
    contractVersions: z
      .object({
        exercise: z.number().int().positive(),
        rubric: z.number().int().positive(),
        evidence: z.number().int().positive(),
        template: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type TemplateProvenance = z.infer<typeof TemplateProvenanceSchema>;
