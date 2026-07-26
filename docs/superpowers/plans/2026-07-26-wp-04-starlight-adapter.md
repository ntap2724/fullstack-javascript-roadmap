# WP-04 Astro Starlight Curriculum Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Release 0 Spike 1 by rendering validated curriculum files outside `apps/docs` through Astro Starlight without creating a second hand-maintained curriculum copy.

**Architecture:** `apps/docs` is a downstream adapter. A small `curriculum-docs-adapter` module converts validated `CurriculumDocument` values into Starlight-compatible content entries and derived navigation. An Astro custom content loader stores those entries in the `docs` collection. Publication-channel filtering happens before entries reach Starlight; semantic IDs remain metadata while route IDs come from explicit slugs.

**Tech Stack:** Astro Content Layer API, Astro custom loader objects, Starlight, Starlight `docsSchema({ extend })`, TypeScript, Zod, Vitest, Playwright, and static output.

## Global Constraints

- The website never becomes the source of curriculum facts
- No Markdown is copied by hand into `apps/docs/src/content/docs`
- Direct loading from `curriculum/` is the primary implementation; deterministic temporary generation is allowed only after a recorded spike failure
- Development includes all publication states; preview excludes draft; production includes published, deprecated, and withdrawn only
- Semantic IDs, route IDs, and source paths stay separate
- Navigation derives from track and module metadata
- Website code may depend on curriculum packages; curriculum packages may not depend on Astro or Starlight
- Release 0 tests must cover static build, route generation, draft filtering, keyboard navigation, and source-link metadata

---

## File map

```text
apps/docs/
├── package.json
├── tsconfig.json
├── astro.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── src/content.config.ts
├── src/content-loader/curriculum-docs-loader.ts
├── src/lib/publication-channel.ts
├── src/lib/create-doc-entries.ts
├── src/lib/sidebar.ts
├── src/components/CurriculumMetadata.astro
├── src/components/DependencyLinks.astro
├── src/styles/custom.css
├── test/create-doc-entries.test.ts
├── test/sidebar.test.ts
└── e2e/docs.spec.ts

curriculum/
├── tracks/track-core.md
├── competencies/js.function.values.md
├── competencies/js.function.closure.md
├── modules/module-js-functions.md
├── lessons/lesson-js-function-values.md
├── lessons/lesson-js-closure-private-state.md
├── assessments/assessment-js-function-values.md
└── assessments/assessment-js-closure.md
```

### Task 1: Scaffold a static Starlight application with no local curriculum copy

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/tsconfig.json`
- Create: `apps/docs/astro.config.mjs`
- Create: `apps/docs/vitest.config.ts`
- Create: `apps/docs/src/styles/custom.css`
- Create: `apps/docs/test/no-local-copy.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`

**Interfaces:**
- Consumes: root catalog versions and public command contract
- Produces: `@roadmap/docs` with `dev`, `build`, `check`, and `test` scripts

- [ ] **Step 1: Write a failing test that prohibits a hand-maintained Starlight docs directory**

```ts
// apps/docs/test/no-local-copy.test.ts
import { access } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('curriculum source ownership', () => {
  it('does not contain a hand-maintained src/content/docs directory', async () => {
    await expect(access(new URL('../src/content/docs', import.meta.url))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Add exact Astro, Starlight, and Playwright versions to the root catalog**

Run with `--save-exact` after reviewing current official compatibility notes:

```bash
pnpm add -Dw --save-exact astro @astrojs/starlight @playwright/test
```

Move the exact version strings to the default `catalog` in `pnpm-workspace.yaml` and reference them as `catalog:` from `apps/docs/package.json`.

- [ ] **Step 3: Create the package and static Starlight configuration**

```json
{
  "name": "@roadmap/docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "check": "astro check",
    "test": "vitest run --config vitest.config.ts",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@astrojs/starlight": "catalog:",
    "@roadmap/curriculum-loader": "workspace:*",
    "@roadmap/curriculum-schema": "workspace:*",
    "@roadmap/curriculum-graph": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "astro": "catalog:"
  },
  "devDependencies": {
    "@playwright/test": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```js
// apps/docs/astro.config.mjs
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  output: 'static',
  integrations: [
    starlight({
      title: 'Lộ trình Fullstack JavaScript',
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
```

- [ ] **Step 4: Add app config and root command wiring**

```json
// apps/docs/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": [".astro/types.d.ts", "src/**/*.ts", "src/**/*.astro", "test/**/*.ts"]
}
```

```ts
// apps/docs/vitest.config.ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'docs',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

Replace the fail-closed root `dev` command with:

```json
{
  "scripts": {
    "dev": "pnpm --filter @roadmap/docs dev",
    "docs:build": "pnpm --filter @roadmap/docs build",
    "docs:check": "pnpm --filter @roadmap/docs check"
  }
}
```

- [ ] **Step 5: Run the package test and commit the scaffold**

```bash
pnpm --filter @roadmap/docs test
pnpm --filter @roadmap/docs check
pnpm check
git add apps/docs package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: scaffold static starlight adapter"
```

The build is expected to remain incomplete until Task 3 registers the `docs` collection; a missing-content build failure is not converted into a warning.

### Task 2: Create real minimal curriculum content for the adapter spike

**Files:**
- Create: `curriculum/tracks/track-core.md`
- Create: `curriculum/competencies/js.function.values.md`
- Create: `curriculum/competencies/js.function.closure.md`
- Create: `curriculum/modules/module-js-functions.md`
- Create: `curriculum/lessons/lesson-js-function-values.md`
- Create: `curriculum/lessons/lesson-js-closure-private-state.md`
- Create: `curriculum/assessments/assessment-js-function-values.md`
- Create: `curriculum/assessments/assessment-js-closure.md`
- Create: `apps/docs/test/minimal-curriculum.test.ts`

**Interfaces:**
- Consumes: curriculum schemas and graph validator
- Produces: the smallest valid published graph that can drive routes and sidebar order

- [ ] **Step 1: Write a failing test for the real curriculum root**

```ts
// apps/docs/test/minimal-curriculum.test.ts
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';

import { fileURLToPath } from 'node:url';

const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

describe('real Release 0 curriculum fixture', () => {
  it('forms a valid graph with one track, one module, and two lessons', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) return;
    expect(corpus.value.documents).toHaveLength(8);
    const graph = buildCurriculumGraph(corpus.value);
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(validateCurriculumGraph(graph.value).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm the real curriculum files are absent**

```bash
pnpm --filter @roadmap/docs test -- minimal-curriculum.test.ts
```

- [ ] **Step 3: Add the core track, module, competencies, and assessments**

Use the exact schemas from WP-02. The track must list `module-js-functions`; the module must list both lesson IDs; `js.function.closure` must depend on `js.function.values`; each competency must resolve to one assessment and one remediation lesson.

The first competency file begins:

```markdown
---
schemaVersion: 1
kind: competency
id: js.function.values
slug: competencies/js/function-values
title: Hàm như một giá trị
description: Truyền, trả về và lưu trữ hàm như dữ liệu runtime
status: published
prerequisites: []
requiredLevel: explain
assessments:
  - assessment-js-function-values
remediation:
  - lesson-js-function-values
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

Một function trong JavaScript là một runtime value. Bài fixture này chỉ chứng minh pipeline nội dung, chưa phải bài học hoàn chỉnh.
```

The body explicitly labels the content as a Release 0 pipeline fixture so the website cannot imply curriculum completeness.

- [ ] **Step 4: Add lesson metadata with route slugs independent of semantic IDs**

`lesson-js-closure-private-state.md` uses:

```yaml
id: lesson-js-closure-private-state
slug: lessons/javascript/functions/closure-private-state
module: module-js-functions
competencies:
  - js.function.closure
prerequisites:
  - js.function.values
```

The file name, stable artifact ID, competency ID, and route slug must all be distinct values in the test assertions.

- [ ] **Step 5: Validate and commit**

```bash
pnpm content:validate curriculum --format text
pnpm --filter @roadmap/docs test -- minimal-curriculum.test.ts
git add curriculum apps/docs/test/minimal-curriculum.test.ts
git commit -m "content: add release zero curriculum spike"
```

### Task 3: Convert curriculum documents into Starlight entries

**Files:**
- Create: `apps/docs/src/lib/publication-channel.ts`
- Create: `apps/docs/src/lib/create-doc-entries.ts`
- Create: `apps/docs/test/create-doc-entries.test.ts`

**Interfaces:**
- Consumes: `CurriculumCorpus` and `PublicationChannel`
- Produces: `createDocEntries(corpus, options): readonly CurriculumDocEntry[]`, with repository-relative public `sourcePath` metadata

- [ ] **Step 1: Write tests for route IDs, semantic IDs, status filtering, and source links**

```ts
// apps/docs/test/create-doc-entries.test.ts
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { createDocEntries } from '../src/lib/create-doc-entries.js';

import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../curriculum/', import.meta.url));

describe('createDocEntries', () => {
  it('uses slug for route ID and retains stable semantic ID as metadata', async () => {
    const corpus = await loadCurriculum(root);
    if (!corpus.ok) throw new Error('Expected valid curriculum');
    const entries = createDocEntries(corpus.value, { channel: 'production', curriculumRoot: root });
    const closure = entries.find(({ data }) => data.semanticId === 'lesson-js-closure-private-state');
    expect(closure?.id).toBe('lessons/javascript/functions/closure-private-state');
    expect(closure?.filePath).toMatch(/lesson-js-closure-private-state\.md$/);
    expect(closure?.data.sourcePath).toBe('lessons/lesson-js-closure-private-state.md');
    expect(closure?.data.sourcePath).not.toContain(root);
  });

  it('filters publication states by channel', async () => {
    const corpus = await loadCurriculum(root);
    if (!corpus.ok) throw new Error('Expected valid curriculum');
    expect(
      createDocEntries(corpus.value, { channel: 'development', curriculumRoot: root }).length,
    ).toBeGreaterThanOrEqual(
      createDocEntries(corpus.value, { channel: 'production', curriculumRoot: root }).length,
    );
  });
});
```

- [ ] **Step 2: Run the tests and confirm the adapter is missing**

```bash
pnpm --filter @roadmap/docs test -- create-doc-entries.test.ts
```

- [ ] **Step 3: Implement publication visibility as a total function**

```ts
// apps/docs/src/lib/publication-channel.ts
import type { PublicationStatus } from '@roadmap/curriculum-schema';

export type PublicationChannel = 'development' | 'preview' | 'production';

const visible: Record<PublicationChannel, ReadonlySet<PublicationStatus>> = {
  development: new Set(['draft', 'review', 'published', 'deprecated', 'withdrawn']),
  preview: new Set(['review', 'published', 'deprecated', 'withdrawn']),
  production: new Set(['published', 'deprecated', 'withdrawn']),
};

export function isVisible(status: PublicationStatus, channel: PublicationChannel): boolean {
  return visible[channel].has(status);
}
```

- [ ] **Step 4: Implement the entry adapter without importing Astro types**

```ts
// apps/docs/src/lib/create-doc-entries.ts
import path from 'node:path';
import type { CurriculumCorpus } from '@roadmap/curriculum-schema';
import type { PublicationChannel } from './publication-channel.js';
import { isVisible } from './publication-channel.js';

export interface CreateDocEntriesOptions {
  channel: PublicationChannel;
  curriculumRoot: string;
}

export interface CurriculumDocEntry {
  id: string;
  filePath: string;
  body: string;
  data: {
    title: string;
    description: string;
    semanticId: string;
    entityKind: string;
    publicationStatus: string;
    sourcePath: string;
    prerequisites: readonly string[];
    competencies: readonly string[];
    lastReviewedIn: string;
  };
}

export function createDocEntries(
  corpus: CurriculumCorpus,
  options: CreateDocEntriesOptions,
): readonly CurriculumDocEntry[] {
  return corpus.documents
    .filter(({ data }) => isVisible(data.status, options.channel))
    .map((document) => ({
      id: document.data.slug,
      filePath: document.filePath,
      body: document.body,
      data: {
        title: document.data.title,
        description: document.data.description,
        semanticId: document.data.id,
        entityKind: document.data.kind,
        publicationStatus: document.data.status,
        sourcePath: path.relative(options.curriculumRoot, document.filePath).split(path.sep).join('/'),
        prerequisites: document.data.prerequisites,
        competencies: 'competencies' in document.data ? document.data.competencies : [],
        lastReviewedIn: document.data.lastReviewedIn,
      },
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}
```

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @roadmap/docs test -- create-doc-entries.test.ts
pnpm --filter @roadmap/docs check
git add apps/docs/src/lib apps/docs/test/create-doc-entries.test.ts
git commit -m "feat: adapt curriculum documents for starlight"
```

### Task 4: Implement the Astro custom content loader and extended Starlight schema

**Files:**
- Create: `apps/docs/src/content-loader/curriculum-docs-loader.ts`
- Create: `apps/docs/src/content.config.ts`
- Create: `apps/docs/test/content-loader.test.ts`

**Interfaces:**
- Consumes: `createDocEntries` and Astro's build-time `Loader` API
- Produces: `curriculumDocsLoader(options): Loader` registered as the Starlight `docs` collection loader

- [ ] **Step 1: Write a unit test around a small loader-store test double**

```ts
// apps/docs/test/content-loader.test.ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { curriculumDocsLoader } from '../src/content-loader/curriculum-docs-loader.js';

it('clears the store and writes entries whose IDs are route slugs', async () => {
  const set = vi.fn();
  const clear = vi.fn();
  const loader = curriculumDocsLoader({
    curriculumRoot: fileURLToPath(new URL('../../../curriculum/', import.meta.url)),
    channel: 'production',
  });

  await loader.load({
    store: { clear, set },
    parseData: async ({ data }) => data,
    watcher: undefined,
    logger: console,
    config: {} as never,
    meta: { get: () => undefined, set: () => undefined },
    generateDigest: (value) => JSON.stringify(value),
    renderMarkdown: async () => ({ html: '' }),
    entryTypes: new Map(),
  } as never);

  expect(clear).toHaveBeenCalledOnce();
  expect(set).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'lessons/javascript/functions/closure-private-state' }),
  );
});
```

- [ ] **Step 2: Run the test and confirm the loader is missing**

```bash
pnpm --filter @roadmap/docs test -- content-loader.test.ts
```

- [ ] **Step 3: Implement the object loader using Astro's official store API**

```ts
// apps/docs/src/content-loader/curriculum-docs-loader.ts
import { createHash } from 'node:crypto';
import type { Loader } from 'astro/loaders';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { createDocEntries } from '../lib/create-doc-entries.js';
import type { PublicationChannel } from '../lib/publication-channel.js';

export interface CurriculumDocsLoaderOptions {
  curriculumRoot: string;
  channel: PublicationChannel;
}

export function curriculumDocsLoader(options: CurriculumDocsLoaderOptions): Loader {
  return {
    name: 'roadmap-curriculum-docs-loader',
    load: async ({ store, parseData, watcher }) => {
      const outcome = await loadCurriculum(options.curriculumRoot);
      if (!outcome.ok) {
        throw new Error(JSON.stringify(outcome.diagnostics));
      }

      store.clear();
      for (const entry of createDocEntries(outcome.value, options)) {
        const data = await parseData({ id: entry.id, data: entry.data });
        store.set({
          id: entry.id,
          data,
          body: entry.body,
          filePath: entry.filePath,
          digest: createHash('sha256')
            .update(JSON.stringify([entry.data, entry.body]))
            .digest('hex'),
        });
      }
      watcher?.add(options.curriculumRoot);
    },
  };
}
```

- [ ] **Step 4: Register the collection and extend Starlight's schema**

```ts
// apps/docs/src/content.config.ts
import { fileURLToPath } from 'node:url';
import { defineCollection, z } from 'astro:content';
import { docsSchema } from '@astrojs/starlight/schema';
import { curriculumDocsLoader } from './content-loader/curriculum-docs-loader.js';

const channel =
  process.env.ROADMAP_PUBLICATION_CHANNEL === 'production'
    ? 'production'
    : process.env.ROADMAP_PUBLICATION_CHANNEL === 'preview'
      ? 'preview'
      : 'development';

export const collections = {
  docs: defineCollection({
    loader: curriculumDocsLoader({
      curriculumRoot: fileURLToPath(new URL('../../curriculum/', import.meta.url)),
      channel,
    }),
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
```

All committed filesystem conversions use `fileURLToPath`; Task 6 verifies the same loader path on Windows and Linux.

- [ ] **Step 5: Build the site in development and production channels**

```bash
ROADMAP_PUBLICATION_CHANNEL=development pnpm --filter @roadmap/docs build
ROADMAP_PUBLICATION_CHANNEL=production pnpm --filter @roadmap/docs build
```

PowerShell:

```powershell
$env:ROADMAP_PUBLICATION_CHANNEL='development'; pnpm --filter @roadmap/docs build
$env:ROADMAP_PUBLICATION_CHANNEL='production'; pnpm --filter @roadmap/docs build
```

Expected: both builds exit `0`; no `apps/docs/src/content/docs` directory exists.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/src/content-loader apps/docs/src/content.config.ts apps/docs/test/content-loader.test.ts
git commit -m "feat: load curriculum through astro content layer"
```

### Task 5: Derive sidebar, dependency links, and source metadata

**Files:**
- Create: `apps/docs/src/lib/sidebar.ts`
- Create: `apps/docs/test/sidebar.test.ts`
- Create: `apps/docs/src/components/CurriculumMetadata.astro`
- Create: `apps/docs/src/components/DependencyLinks.astro`
- Modify: `apps/docs/astro.config.mjs`

**Interfaces:**
- Consumes: validated curriculum graph
- Produces: `buildSidebar(corpus): readonly SidebarItem[]` and Starlight component overrides that display semantic metadata

- [ ] **Step 1: Write the sidebar-order test**

```ts
// apps/docs/test/sidebar.test.ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { buildSidebar } from '../src/lib/sidebar.js';

it('follows track module order instead of lexical file order', async () => {
  const corpus = await loadCurriculum(fileURLToPath(new URL('../../../curriculum/', import.meta.url)));
  if (!corpus.ok) throw new Error('Expected valid curriculum');
  expect(buildSidebar(corpus.value)).toEqual([
    expect.objectContaining({ label: 'Core curriculum' }),
  ]);
});
```

- [ ] **Step 2: Run the test and confirm the sidebar builder is missing**

```bash
pnpm --filter @roadmap/docs test -- sidebar.test.ts
```

- [ ] **Step 3: Implement navigation from explicit track and module arrays**

```ts
// apps/docs/src/lib/sidebar.ts
import type { CurriculumCorpus } from '@roadmap/curriculum-schema';

export interface SidebarItem {
  label: string;
  items: readonly ({ label: string; link: string } | SidebarItem)[];
}

export function buildSidebar(corpus: CurriculumCorpus): readonly SidebarItem[] {
  const documentsById = new Map(corpus.documents.map((document) => [document.data.id, document]));
  const tracks = corpus.documents.filter(({ data }) => data.kind === 'track');
  return tracks.map(({ data: track }) => ({
    label: track.title,
    items: track.modules.map((moduleId) => {
      const moduleDocument = documentsById.get(moduleId);
      if (!moduleDocument || moduleDocument.data.kind !== 'module') {
        throw new Error(`Resolved module missing from corpus: ${moduleId}`);
      }
      return {
        label: moduleDocument.data.title,
        items: moduleDocument.data.lessons.map((lessonId) => {
          const lesson = documentsById.get(lessonId);
          if (!lesson || lesson.data.kind !== 'lesson') {
            throw new Error(`Resolved lesson missing from corpus: ${lessonId}`);
          }
          return { label: lesson.data.title, link: `/${lesson.data.slug}/` };
        }),
      };
    }),
  }));
}
```

- [ ] **Step 4: Render semantic metadata without duplicating curriculum facts**

`CurriculumMetadata.astro` reads Starlight entry data and renders only public, repository-relative metadata:

```text
Stable ID
Publication status
Source path
Last reviewed version
```

`DependencyLinks.astro` resolves prerequisite IDs to their route slugs through a generated in-memory catalog. It must not hard-code lesson URLs.

- [ ] **Step 5: Inject derived sidebar into Starlight configuration**

Because `astro.config.mjs` cannot await the Astro content collection, add a deterministic pre-config loader that reads the validated curriculum directly. Export `loadSidebar()` from `sidebar.ts` and use top-level `await` in `astro.config.mjs`:

```js
import { fileURLToPath } from 'node:url';
import { loadSidebar } from './src/lib/sidebar.js';

const sidebar = await loadSidebar({
  curriculumRoot: fileURLToPath(new URL('../../curriculum', import.meta.url)),
  channel: process.env.ROADMAP_PUBLICATION_CHANNEL ?? 'development',
});
```

This adapter may duplicate parsing work during build, but not content facts. Do not write generated navigation to a committed file.

- [ ] **Step 6: Run tests, build, and commit**

```bash
pnpm --filter @roadmap/docs test
ROADMAP_PUBLICATION_CHANNEL=production pnpm --filter @roadmap/docs build
git add apps/docs/src/lib/sidebar.ts apps/docs/test/sidebar.test.ts apps/docs/src/components apps/docs/astro.config.mjs
git commit -m "feat: derive docs navigation from curriculum graph"
```

### Task 6: Prove production filtering, hot reload, keyboard access, and static routes

**Files:**
- Create: `apps/docs/playwright.config.ts`
- Create: `apps/docs/e2e/docs.spec.ts`
- Create: `curriculum/lessons/lesson-release-zero-draft.md`
- Create: `scripts/verify-wp-04.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: built Starlight app and publication-channel behavior
- Produces: `pnpm docs:test:e2e`, `pnpm verify:wp-04`, and Spike 1 evidence

- [ ] **Step 1: Add a draft lesson that is valid but excluded from production**

The draft lesson belongs to `module-js-functions`, has a unique stable ID and route slug, and uses `status: draft`. Do not add it to the published module's required lesson list, because published content may not depend on draft content.

- [ ] **Step 2: Write Playwright tests for visible and excluded routes**

```ts
// apps/docs/e2e/docs.spec.ts
import { expect, test } from '@playwright/test';

test('published lesson renders semantic metadata and keyboard-visible navigation', async ({ page }) => {
  await page.goto('/lessons/javascript/functions/closure-private-state/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Closure');
  await expect(page.getByText('lesson-js-closure-private-state')).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
});

test('draft route is absent from a production build', async ({ page }) => {
  const response = await page.goto('/lessons/release-zero/draft/');
  expect(response?.status()).toBe(404);
});
```

- [ ] **Step 3: Configure a production static preview server**

```ts
// apps/docs/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4321' },
  webServer: {
    command: 'pnpm build && pnpm exec astro preview --host 127.0.0.1',
    env: { ROADMAP_PUBLICATION_CHANNEL: 'production' },
    port: 4321,
    reuseExistingServer: false,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 4: Add a development hot-reload smoke procedure**

Automate the test with a Node child process:

```text
1. Start `astro dev` on a fixed test port
2. Request the published lesson and record its title
3. Edit only the fixture body with a unique marker
4. Poll the route until the marker appears
5. Restore the original file in a `finally` block
6. Stop the dev server
```

Store this test as `apps/docs/test/hot-reload.integration.test.ts`. It must restore the source even when the assertion fails.

- [ ] **Step 5: Add and run the WP-04 gate**

```js
// scripts/verify-wp-04.mjs
import { runPipeline } from './run-pipeline.mjs';

await runPipeline([
  'content:validate:curriculum',
  'docs:check',
  'docs:build',
  'docs:test:e2e',
]);
```

Root scripts:

```json
{
  "scripts": {
    "docs:test:e2e": "pnpm --filter @roadmap/docs test:e2e",
    "verify:wp-04": "node scripts/verify-wp-04.mjs",
    "verify": "node scripts/run-pipeline.mjs check test content:validate:curriculum schema:check docs:build"
  }
}
```

Run:

```bash
pnpm exec playwright install chromium
pnpm verify:wp-04
```

- [ ] **Step 6: Inspect generated routes and commit**

Verify the production `dist` contains the published lesson route and does not contain the draft route. Then:

```bash
git add apps/docs curriculum/lessons/lesson-release-zero-draft.md scripts/verify-wp-04.mjs package.json pnpm-lock.yaml
git commit -m "test: prove curriculum to starlight spike"
```

WP-04 is complete only after a reviewer confirms that removing the production status filter makes the draft-route test fail and that no hand-maintained curriculum copy exists under `apps/docs`.
