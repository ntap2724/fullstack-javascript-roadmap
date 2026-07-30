import { fileURLToPath } from 'node:url';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { describe, expect, it } from 'vitest';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

const expectedIds = [
  'assessment-js-closure',
  'assessment-js-function-values',
  'js.function.closure',
  'js.function.values',
  'lesson-js-closure-private-state',
  'lesson-js-function-values',
  'module-js-functions',
  'track-core',
];

describe('Release 0 curriculum fixture', () => {
  it('is exactly the valid eight-document Task 2 graph', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;

    expect(corpus.value.documents).toHaveLength(8);
    expect(corpus.value.documents.map(({ data }) => data.id).sort()).toEqual(expectedIds);
    expect(corpus.value.documents.every(({ data }) => data.status === 'published')).toBe(true);
    const kindCounts = corpus.value.documents.reduce<Record<string, number>>(
      (counts, { data }) => ({
        ...counts,
        [data.kind]: (counts[data.kind] ?? 0) + 1,
      }),
      {},
    );
    expect(kindCounts).toEqual({
      assessment: 2,
      competency: 2,
      lesson: 2,
      module: 1,
      track: 1,
    });

    const moduleDocument = corpus.value.documents.find(
      ({ data }) => data.id === 'module-js-functions',
    );
    expect(moduleDocument?.data.kind).toBe('module');
    if (moduleDocument?.data.kind === 'module') {
      expect(moduleDocument.data.lessons).toEqual([
        'lesson-js-function-values',
        'lesson-js-closure-private-state',
      ]);
    }

    const graph = buildCurriculumGraph(corpus.value);
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(validateCurriculumGraph(graph.value).ok).toBe(true);
  });
});
