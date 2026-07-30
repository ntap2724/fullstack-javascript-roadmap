import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { describe, expect, it } from 'vitest';
import { curriculumRuntime } from '../src/lib/curriculum-runtime.js';
import { buildSidebar, loadSidebar } from '../src/lib/sidebar.js';

describe('curriculum sidebar', () => {
  it('preserves declared lesson order instead of sorting links lexically', async () => {
    const corpus = await loadCurriculum(curriculumRuntime.curriculumRoot);
    if (!corpus.ok) {
      throw new Error(JSON.stringify(corpus.diagnostics));
    }

    const sidebar = buildSidebar(corpus.value, 'production');
    const trackGroup = sidebar[0];
    if (trackGroup === undefined || !('items' in trackGroup)) {
      throw new Error('Expected one track sidebar group');
    }
    const moduleItem = trackGroup.items[0];
    if (moduleItem === undefined || !('items' in moduleItem)) {
      throw new Error('Expected the first track item to be a module sidebar group');
    }
    const lessonLinks = moduleItem.items.map((item) => {
      if (!('link' in item)) {
        throw new Error('Expected every module item to be a lesson sidebar link');
      }
      return item.link;
    });

    expect(lessonLinks).toEqual([
      '/lessons/javascript/functions/function-values/',
      '/lessons/javascript/functions/closure-private-state/',
    ]);
    expect([...lessonLinks].sort()).not.toEqual(lessonLinks);
    await expect(loadSidebar(curriculumRuntime)).resolves.toEqual(sidebar);
  });

  it('fails closed when the shared curriculum graph validation rejects the runtime corpus', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'roadmap-sidebar-graph-'));
    const curriculumRoot = path.join(workspace, 'curriculum');

    try {
      await cp(curriculumRuntime.curriculumRoot, curriculumRoot, { recursive: true });
      const lessonPath = path.join(curriculumRoot, 'lessons', 'lesson-js-function-values.md');
      const source = await readFile(lessonPath, 'utf8');
      const cyclicSource = source.replace(
        'prerequisites: []',
        'prerequisites:\n  - lesson-js-closure-private-state',
      );
      if (cyclicSource === source) {
        throw new Error('Expected the fixture lesson to have an empty prerequisite list');
      }
      await writeFile(lessonPath, cyclicSource, 'utf8');

      await expect(loadSidebar({ channel: 'production', curriculumRoot })).rejects.toThrow(
        /CURRICULUM_GRAPH_003/,
      );
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
