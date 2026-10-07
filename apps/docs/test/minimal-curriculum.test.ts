import { fileURLToPath } from 'node:url';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { describe, expect, it } from 'vitest';

import { createDocEntries } from '../src/lib/create-doc-entries.js';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

const releaseZeroIds = [
  'assessment-js-closure',
  'assessment-js-function-values',
  'gate-release-zero-baseline',
  'js.function.closure',
  'js.function.values',
  'lesson-js-closure-private-state',
  'lesson-js-function-values',
  'lesson-release-zero-draft',
  'module-js-functions',
  'track-core',
] as const;

describe('Release 0 curriculum fixture', () => {
  it('loads the full curriculum including Release 1 skeleton', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;

    const releaseZeroDocuments = corpus.value.documents.filter(
      ({ data }) => data.status === 'published' || data.status === 'draft',
    );
    expect(releaseZeroDocuments.map(({ data }) => data.id).sort()).toEqual(releaseZeroIds);
    expect(releaseZeroDocuments).toHaveLength(releaseZeroIds.length);

    const productionEntries = createDocEntries(corpus.value, {
      channel: 'production',
      curriculumRoot,
    });
    expect(productionEntries.map((entry) => entry.data.semanticId).sort()).toEqual(
      releaseZeroIds.filter((id) => id !== 'lesson-release-zero-draft').sort(),
    );
    expect(productionEntries.some((entry) => entry.data.semanticId === 'release-0-1-0')).toBe(
      false,
    );
    expect(
      createDocEntries(corpus.value, { channel: 'preview', curriculumRoot }).some(
        (entry) => entry.data.semanticId === 'release-0-1-0',
      ),
    ).toBe(true);

    // Verify the graph is valid (acyclic, references resolve, completeness checks pass)
    const graph = buildCurriculumGraph(corpus.value);
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(validateCurriculumGraph(graph.value).ok).toBe(true);

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
