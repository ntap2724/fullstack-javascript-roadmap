import { fileURLToPath } from 'node:url';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { describe, expect, it } from 'vitest';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

describe('Release 0 curriculum fixture', () => {
  it('loads the full curriculum including Release 1 skeleton', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;

    // 63 total documents: Release 0 fixtures + Release 1 technical preview skeleton
    expect(corpus.value.documents.length).toBeGreaterThanOrEqual(63);
    expect(corpus.value.documents.filter(({ data }) => data.status === 'draft')).toHaveLength(1);

    // Verify the graph is valid (acyclic, references resolve, completeness checks pass)
    const graph = buildCurriculumGraph(corpus.value);
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(validateCurriculumGraph(graph.value).ok).toBe(true);

    // Verify key Release 0 entities still exist
    expect(corpus.value.documents.some(({ data }) => data.id === 'track-core')).toBe(true);
    expect(corpus.value.documents.some(({ data }) => data.id === 'module-js-functions')).toBe(true);
    expect(corpus.value.documents.some(({ data }) => data.id === 'js.function.closure')).toBe(true);
    expect(corpus.value.documents.some(({ data }) => data.id === 'lesson-release-zero-draft')).toBe(
      true,
    );

    // Verify key Release 1 skeleton entities exist
    expect(corpus.value.documents.some(({ data }) => data.id === 'release-0-1-0')).toBe(true);
    expect(corpus.value.documents.some(({ data }) => data.id === 'track-core-vertical-slice')).toBe(
      true,
    );
    expect(
      corpus.value.documents.some(({ data }) => data.id === 'project-workshop-enrollment'),
    ).toBe(true);
  });
});
