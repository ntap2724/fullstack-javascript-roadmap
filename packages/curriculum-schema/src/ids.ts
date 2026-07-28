import { z } from 'zod';

export const CompetencyIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*)+$/);

export const ArtifactIdSchema = z
  .string()
  .regex(
    /^(?:track|gate|module|lesson|assessment|milestone|project|exercise|ex|lab|check|rubric|evidence|release|remediation|change-request|debugging)-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  );

export const RouteSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/)
  .refine((value) => !value.startsWith('/') && !value.endsWith('/'));

export type CompetencyId = z.infer<typeof CompetencyIdSchema>;
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;
