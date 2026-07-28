import { z } from 'zod';
import { ArtifactIdSchema, RouteSlugSchema } from './ids.js';

export const PublicationStatusSchema = z.enum([
  'draft',
  'review',
  'published',
  'deprecated',
  'withdrawn',
]);

export const MasteryLevelSchema = z.enum([
  'recognize',
  'explain',
  'implement',
  'diagnose',
  'design-and-justify',
]);

export const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const CommonArtifactFields = {
  schemaVersion: z.literal(1),
  id: ArtifactIdSchema,
  slug: RouteSlugSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  status: PublicationStatusSchema,
  prerequisites: z.array(z.string()).default([]),
  introducedIn: SemverSchema,
  lastReviewedIn: SemverSchema,
};
