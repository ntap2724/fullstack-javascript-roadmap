import { fileURLToPath } from 'node:url';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { describe, expect, it } from 'vitest';
import { createDocEntries } from '../src/lib/create-doc-entries.js';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

const expectedFinalIds = [
  'assessment-js-closure',
  'assessment-js-function-values',
  'js.function.closure',
  'js.function.values',
  'lesson-js-closure-private-state',
  'lesson-js-function-values',
  'lesson-release-zero-draft',
  'module-js-functions',
  'track-core',
];

describe('Release 0 curriculum fixture', () => {
  it('is exactly the valid nine-document final graph', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;

    expect(corpus.value.documents).toHaveLength(9);
    expect(corpus.value.documents.map(({ data }) => data.id).sort()).toEqual(expectedFinalIds);
    expect(corpus.value.documents.filter(({ data }) => data.status === 'draft')).toHaveLength(1);
    const finalKindCounts = corpus.value.documents.reduce<Record<string, number>>(
      (counts, { data }) => ({
        ...counts,
        [data.kind]: (counts[data.kind] ?? 0) + 1,
      }),
      {},
    );
    expect(finalKindCounts).toEqual({
      assessment: 2,
      competency: 2,
      lesson: 3,
      module: 1,
      track: 1,
    });
    expect(createDocEntries(corpus.value, { channel: 'production', curriculumRoot })).toHaveLength(
      8,
    );
    expect(createDocEntries(corpus.value, { channel: 'development', curriculumRoot })).toHaveLength(
      9,
    );
    expect(corpus.value.documents.some(({ data }) => data.id === 'lesson-release-zero-draft')).toBe(
      true,
    );

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
