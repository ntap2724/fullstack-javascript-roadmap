/// <reference types="astro/client" />

import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { curriculumDocsLoader } from './content-loader/curriculum-docs-loader.js';
import { curriculumRuntime } from './lib/curriculum-runtime.js';

export const collections = {
  docs: defineCollection({
    loader: curriculumDocsLoader(curriculumRuntime),
    schema: docsSchema({
      extend: z.object({
        semanticId: z.string(),
        entityKind: z.string(),
        publicationStatus: z.string(),
        sourcePath: z.string(),
        prerequisites: z.array(z.string()),
        competencies: z.array(z.string()),
        lastReviewedIn: z.string(),
      }),
    }),
  }),
};
