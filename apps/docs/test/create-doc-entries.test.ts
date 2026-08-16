import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import type {
  CurriculumCorpus,
  CurriculumDocument,
  CurriculumEntity,
} from '@roadmap/curriculum-schema';
import { describe, expect, it } from 'vitest';
import { createDocEntries } from '../src/lib/create-doc-entries.js';
import type { PublicationChannel } from '../src/lib/publication-channel.js';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

const expectedProductionRouteIds = [
  'assessments/javascript/functions/closure',
  'assessments/javascript/functions/function-values',
  'competencies/js/function-closure',
  'competencies/js/function-values',
  'gates/release-zero-baseline',
  'lessons/javascript/functions/closure-private-state',
  'lessons/javascript/functions/function-values',
  'modules/javascript/functions',
  'tracks/core',
];

const publicationStatuses: readonly CurriculumEntity['status'][] = [
  'draft',
  'review',
  'published',
  'deprecated',
  'withdrawn',
];

const expectedSyntheticRoutes: Record<PublicationChannel, readonly string[]> = {
  development: [
    'synthetic/deprecated',
    'synthetic/draft',
    'synthetic/published',
    'synthetic/review',
    'synthetic/withdrawn',
  ],
  preview: [
    'synthetic/deprecated',
    'synthetic/published',
    'synthetic/review',
    'synthetic/withdrawn',
  ],
  production: ['synthetic/deprecated', 'synthetic/published', 'synthetic/withdrawn'],
};

describe('curriculum document entry adapter', () => {
  it('preserves route, provenance, raw body, and semantic metadata', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;

    const entries = createDocEntries(corpus.value, {
      channel: 'production',
      curriculumRoot,
    });
    const closure = entries.find(
      ({ data }) => data.semanticId === 'lesson-js-closure-private-state',
    );

    expect(entries.map(({ id }) => id)).toEqual(expectedProductionRouteIds);
    expect(closure?.id).toBe('lessons/javascript/functions/closure-private-state');
    expect(closure?.id).not.toBe(closure?.data.semanticId);
    expect(closure?.filePath).toMatch(/lesson-js-closure-private-state\.md$/);
    expect(closure?.body).toContain('RELEASE_ZERO_CLOSURE_BODY');
    expect(closure?.data).toMatchObject({
      competencies: ['js.function.closure'],
      entityKind: 'lesson',
      lastReviewedIn: '0.1.0',
      prerequisites: ['lesson-js-function-values'],
      publicationStatus: 'published',
      semanticId: 'lesson-js-closure-private-state',
      sourcePath: 'curriculum/lessons/lesson-js-closure-private-state.md',
    });
    expect(closure?.data.sourcePath).not.toContain(curriculumRoot);
    expect(
      entries.every(
        ({ data }) =>
          data.sourcePath.startsWith('curriculum/') && !path.isAbsolute(data.sourcePath),
      ),
    ).toBe(true);
  });

  it('filters every publication status by channel and sorts by route ID', async () => {
    const loaded = await loadCurriculum(curriculumRoot);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const template = loaded.value.documents.find(
      ({ data }) => data.id === 'lesson-js-closure-private-state',
    );
    expect(template).toBeDefined();
    if (template === undefined) return;

    const documents: CurriculumDocument[] = publicationStatuses.map((status) => ({
      body: `SYNTHETIC_${status.toUpperCase()}_BODY`,
      data: {
        ...template.data,
        id: `synthetic-${status}`,
        slug: `synthetic/${status}`,
        status,
      },
      filePath: path.join(curriculumRoot, 'synthetic', `${status}.md`),
    }));
    const syntheticCorpus: CurriculumCorpus = { documents };

    for (const channel of ['development', 'preview', 'production'] as const) {
      const entries = createDocEntries(syntheticCorpus, {
        channel,
        curriculumRoot,
      });
      expect(entries.map(({ id }) => id)).toEqual(expectedSyntheticRoutes[channel]);
    }
  });

  it('rejects a document outside the active curriculum root', async () => {
    const loaded = await loadCurriculum(curriculumRoot);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const template = loaded.value.documents.find(
      ({ data }) => data.id === 'lesson-js-closure-private-state',
    );
    expect(template).toBeDefined();
    if (template === undefined) return;

    const outsideCorpus: CurriculumCorpus = {
      documents: [
        {
          ...template,
          filePath: path.resolve(curriculumRoot, '..', 'outside.md'),
        },
      ],
    };

    expect(() =>
      createDocEntries(outsideCorpus, {
        channel: 'production',
        curriculumRoot,
      }),
    ).toThrow(/outside the active curriculum root/);
  });
});
