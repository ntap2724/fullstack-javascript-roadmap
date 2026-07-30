# WP-04 Astro Starlight Curriculum Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove Release 0 Spike 1 by rendering validated curriculum files outside `apps/docs` through Astro Starlight without creating a second hand-maintained curriculum copy.

**Architecture:** `apps/docs` is a downstream adapter. A small `curriculum-docs-adapter` module converts validated `CurriculumDocument` values into Starlight-compatible content entries and derived navigation. An Astro custom content loader stores those entries in the `docs` collection. Publication-channel filtering happens before entries reach Starlight; semantic IDs remain metadata while route IDs come from explicit slugs.

**Tech Stack:** Astro Content Layer API, Astro custom loader objects, Starlight, Starlight `docsSchema({ extend })`, TypeScript, Zod from `astro/zod`, Vitest, Playwright, and static output.

## Global Constraints

- The website never becomes the source of curriculum facts.
- No Markdown is copied by hand into `apps/docs/src/content/docs`.
- Direct loading from the repository `curriculum/` directory is the primary implementation. An alternate curriculum root is a test seam only and never a second committed content source.
- Development includes `draft`, `review`, `published`, `deprecated`, and `withdrawn`.
- Preview includes `review`, `published`, `deprecated`, and `withdrawn`.
- Production includes `published`, `deprecated`, and `withdrawn`.
- Invalid explicit publication-channel values fail closed.
- Semantic IDs, route IDs, and public source paths stay separate.
- Public source paths are forward-slash normalized and repository-relative, including the `curriculum/` prefix.
- Navigation derives from the explicit track `modules` and module `lessons` arrays, not lexical file order.
- Website code may depend on curriculum packages; curriculum packages may not depend on Astro, Starlight, or `apps/docs`.
- Release 0 tests cover rendered Markdown body content, static route generation, draft filtering, development draft availability, keyboard navigation, dependency links, source-link metadata, and hot reload from a temporary curriculum copy.
- Every change to an existing root JSON, YAML, Vitest, or script contract is a surgical merge. Preserve all WP-00–03 scripts, strict catalog entries, workspace settings, Vitest project discovery, direct gates, unavailable verifiers, policy checks, and lockfile ownership.

---

## 2026-07-30 preflight amendment and Owner rulings

This section records the authoritative pre-Task-1 rulings. It corrects implementation details only; it does not change the approved product goal, architecture, publication model, dependency direction, remote policy, shared master interfaces, or six-task decomposition.

### Stable registry pins and compatibility

Add these exact versions to the existing strict root catalog:

```yaml
'@astrojs/check': 0.9.10
'@astrojs/starlight': 0.41.5
'@playwright/test': 1.62.0
astro: 7.1.6
```

- `@astrojs/starlight@0.41.5` declares peer `astro: ^7.0.2`; `astro@7.1.6` satisfies it.
- Starlight's `@astrojs/markdown-remark` peer is optional.
- `astro@7.1.6` supports Node `>=22.12.0`; the repository's pinned Node 24 contract satisfies it.
- `@astrojs/check@0.9.10` supports TypeScript `^5.0.0 || ^6.0.0`; catalog TypeScript `6.0.2` satisfies it.
- `@playwright/test@1.62.0` supports Node `>=20`; the repository's Node 24 contract satisfies it.
- `astro check` must use the installed exact `@astrojs/check` dependency and must never rely on an interactive install prompt.
- Install Chromium through the package-pinned CLI: `pnpm exec playwright install chromium`.

Primary official references:

- <https://docs.astro.build/en/reference/content-loader-reference/>
- <https://docs.astro.build/en/reference/cli-reference/>
- <https://starlight.astro.build/reference/configuration/>
- <https://starlight.astro.build/reference/frontmatter/>
- <https://starlight.astro.build/reference/overrides/>
- <https://playwright.dev/docs/browsers>
- <https://playwright.dev/docs/test-webserver>

### Binding A–J decisions

- **A — Task ownership:** Task 1 remains incomplete until Task 4 registers the custom `docs` collection in `src/content.config.ts`.
- **B — Corpus counts:** Task 2 creates exactly eight published documents. Task 6 adds exactly one draft lesson and modifies Task 2's retained corpus test to prove nine total, eight production-visible, and one draft.
- **C — Hot reload:** No test mutates tracked files under authoritative `curriculum/`. The integration test copies the corpus to a test-owned temporary root, runs Astro with an explicit root override, mutates only the copy, verifies a rendered marker update, and cleans up in `finally`. It compares authoritative source hashes and Git state before and after.
- **D — Root merges:** Root snippets in this plan add or replace only named keys. They never replace a root object wholesale.
- **E — Framework contracts:** The loader calls `parseData()`, `renderMarkdown()`, and `generateDigest()`, stores `rendered`, and registers scoped serialized `add`, `change`, and `unlink` callbacks without duplicate handlers. The content schema uses `astro/zod` and `docsSchema({ extend })`. Playwright uses `webServer.url`, a static build, and local preview. Process lifecycle is Windows-safe.
- **F — Current schema:** The exact metadata below includes every current required field. Task 2 proves both `buildCurriculumGraph()` and `validateCurriculumGraph()` succeed.
- **G — Root commands:** Preserve the complete current root command graph. Add `docs:build`, `docs:check`, `docs:test:e2e`, and `verify:wp-04`; integrate `docs:check` into `check` and `docs:build` into `verify` without recursion or duplicate unit-test execution. Keep `pnpm test`, all direct WP-00–03 gates, `verify:templates`, and `verify:release`.
- **H — Publication defaults:** Explicit channel values accept only `development`, `preview`, or `production`. Without an explicit value, `astro dev` resolves to development and a static build resolves to production.
- **I — Dependency and root boundary:** `apps/docs/src/content/docs` must remain absent. Both the content collection and pre-config sidebar consume domain packages and the same shared runtime resolver. From `apps/docs/src/lib/`, the default root is the real repository `curriculum/` directory at `../../../../curriculum/`.
- **J — Discriminating evidence:** Tests separately prove rendered body content, route/semantic-ID separation, non-lexical navigation, `curriculum/`-prefixed source paths, development draft presence, production draft absence, generated-route inclusion/exclusion, a named keyboard target, no local content copy, and disposable-worktree production-filter mutation review.

### Exact current schema contract for the minimal corpus

All nine documents use:

```yaml
schemaVersion: 1
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

All include non-empty `title` and `description`, an explicit `status`, a route `slug`, a stable `id`, and an explicit `prerequisites` array. Type-specific required fields are:

- track: `requiredCompetencies`, `modules`
- module: `competencies`, `lessons`
- lesson: `module`, `competencies`, `exercises`, `assessments`, `sourceLanguage: vi`, `professionalArtifactLanguage: en`
- competency: `requiredLevel`, `assessments`, `remediation`
- assessment: `assessmentType`, `competencies`

Tasks 2 and 6 own the exact frontmatter values. Do not omit fields because a Zod schema supplies a default; the fixture is executable contract evidence.

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
├── src/lib/curriculum-runtime.ts
├── src/lib/publication-channel.ts
├── src/lib/create-doc-entries.ts
├── src/lib/sidebar.ts
├── src/lib/dependency-links.ts
├── src/components/PageTitle.astro
├── src/components/CurriculumMetadata.astro
├── src/components/DependencyLinks.astro
├── src/styles/custom.css
├── test/no-local-copy.test.ts
├── test/minimal-curriculum.test.ts
├── test/curriculum-runtime.test.ts
├── test/create-doc-entries.test.ts
├── test/content-loader.test.ts
├── test/sidebar.test.ts
├── test/dependency-links.test.ts
├── test/hot-reload.integration.test.ts
└── e2e/docs.spec.ts

curriculum/
├── tracks/track-core.md
├── competencies/js.function.values.md
├── competencies/js.function.closure.md
├── modules/module-js-functions.md
├── lessons/lesson-js-function-values.md
├── lessons/lesson-js-closure-private-state.md
├── lessons/lesson-release-zero-draft.md
├── assessments/assessment-js-function-values.md
└── assessments/assessment-js-closure.md

scripts/
└── verify-wp-04.mjs
```

### Task 1: Scaffold a static Starlight application with no local curriculum copy

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/tsconfig.json`
- Create: `apps/docs/astro.config.mjs`
- Create: `apps/docs/vitest.config.ts`
- Create: `apps/docs/src/styles/custom.css`
- Create: `apps/docs/test/no-local-copy.test.ts`
- Modify surgically: `pnpm-workspace.yaml`
- Modify surgically: `package.json`
- Modify through pnpm only: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing strict root catalog, current workspace discovery, TypeScript base config, and public command contract.
- Produces: package `@roadmap/docs`; package scripts `dev`, `build`, `preview`, `check`, `test`, and `test:e2e`; root scripts `dev`, `docs:build`, and `docs:check`.
- Does not produce the content collection. Task 4 owns `apps/docs/src/content.config.ts` and registers `docs`.

- [ ] **Step 1: Record the genuine RED without falsifying the permanent invariant**

Run before `apps/docs/package.json` exists:

```powershell
pnpm --filter @roadmap/docs test -- no-local-copy.test.ts
```

Expected: non-zero because the `@roadmap/docs` filter target does not exist. This is the genuine Task 1 RED. Do not create `apps/docs/src/content/docs` to force the invariant test to fail.

- [ ] **Step 2: Add the permanent no-local-copy invariant**

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

- [ ] **Step 3: Merge exact catalog pins into the existing workspace YAML**

Surgically add these entries to the existing `catalog` mapping in `pnpm-workspace.yaml`; preserve `packages`, `catalogMode`, `cleanupUnusedCatalogs`, `disallowWorkspaceCycles`, `engineStrict`, `failIfNoMatch`, `sharedWorkspaceLockfile`, `strictPeerDependencies`, `saveWorkspaceProtocol`, `allowBuilds`, and every existing catalog entry:

```yaml
catalog:
  '@astrojs/check': 0.9.10
  '@astrojs/starlight': 0.41.5
  '@playwright/test': 1.62.0
  astro: 7.1.6
```

- [ ] **Step 4: Create the package and static Starlight shell**

```json
{
  "name": "@roadmap/docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview --host 127.0.0.1 --port 4321",
    "check": "astro check",
    "test": "vitest run --config vitest.config.ts",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@astrojs/starlight": "catalog:",
    "@roadmap/curriculum-graph": "workspace:*",
    "@roadmap/curriculum-loader": "workspace:*",
    "@roadmap/curriculum-schema": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "astro": "catalog:"
  },
  "devDependencies": {
    "@astrojs/check": "catalog:",
    "@playwright/test": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```json
// apps/docs/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": [".astro/types.d.ts", "src/**/*.ts", "src/**/*.astro", "test/**/*.ts", "e2e/**/*.ts"]
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
    testTimeout: 30_000,
  },
});
```

This new app config is additive. Do not replace root `vitest.config.ts`; its existing `apps/*/vitest.config.ts` project discovery already owns app integration.

```css
/* apps/docs/src/styles/custom.css */
.curriculum-metadata {
  display: grid;
  gap: 0.25rem;
  margin-block: 1rem;
}

.curriculum-dependencies {
  margin-block: 1rem 2rem;
}
```

```js
// apps/docs/astro.config.mjs
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

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

- [ ] **Step 5: Surgically add the initial root commands**

In the existing root `package.json`, replace only `scripts.dev` and add only the two named docs scripts:

```json
{
  "scripts": {
    "dev": "pnpm --filter @roadmap/docs dev",
    "docs:build": "pnpm --filter @roadmap/docs build",
    "docs:check": "pnpm --filter @roadmap/docs check"
  }
}
```

Preserve every other current root script, including `format`, `format:check`, `lint`, `typecheck`, `check`, `policy:check`, `test`, `test:bootstrap`, `test:wp-00-01-gate`, `test:unit`, `verify:wp-00-01`, `verify:wp-02-03`, `verify`, `verify:templates`, `verify:release`, content validation, and schema generation/check.

- [ ] **Step 6: Install, prove GREEN, and commit only the scaffold boundary**

```powershell
pnpm install
pnpm install --frozen-lockfile
pnpm --filter @roadmap/docs test -- no-local-copy.test.ts
pnpm test:bootstrap
git diff --check
git add -- apps/docs/package.json apps/docs/tsconfig.json apps/docs/astro.config.mjs apps/docs/vitest.config.ts apps/docs/src/styles/custom.css apps/docs/test/no-local-copy.test.ts package.json pnpm-workspace.yaml pnpm-lock.yaml
git diff --cached --name-only
git commit -m "feat: scaffold static starlight adapter"
```

Expected staged paths are exactly the files named by this task. The permanent invariant passes. `docs:check` and `docs:build` remain intentionally incomplete until Task 4 registers the `docs` collection; do not downgrade that failure to a warning and do not claim those gates yet.

### Task 2: Create the exact eight-document curriculum corpus

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
- Consumes: merged exports from `@roadmap/curriculum-schema`, `loadCurriculum()`, `buildCurriculumGraph()`, and `validateCurriculumGraph()`.
- Produces: exactly eight published documents, one valid graph, two deliberately non-lexically ordered lesson routes, and the retained corpus test that Task 6 later modifies.

- [ ] **Step 1: Write the failing exact-corpus test**

The test must assert all eight document IDs, exact count `8`, exact kind/status counts, explicit module lesson order, and both graph outcomes:

```ts
// apps/docs/test/minimal-curriculum.test.ts
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
```

- [ ] **Step 2: Run RED**

```powershell
pnpm --filter @roadmap/docs test -- minimal-curriculum.test.ts
```

Expected: failure because the eight authoritative curriculum documents do not exist.

- [ ] **Step 3: Add the track and module with exact current fields**

```yaml
# curriculum/tracks/track-core.md frontmatter
schemaVersion: 1
kind: track
id: track-core
slug: tracks/core
title: Core curriculum
description: Release 0 JavaScript function track
status: published
prerequisites: []
requiredCompetencies:
  - js.function.values
  - js.function.closure
modules:
  - module-js-functions
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

```yaml
# curriculum/modules/module-js-functions.md frontmatter
schemaVersion: 1
kind: module
id: module-js-functions
slug: modules/javascript/functions
title: JavaScript functions
description: Function values and closure behavior
status: published
prerequisites: []
competencies:
  - js.function.values
  - js.function.closure
lessons:
  - lesson-js-function-values
  - lesson-js-closure-private-state
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

The lesson order above is intentionally the reverse of lexical file order and is the navigation-order oracle.

- [ ] **Step 4: Add both competencies with exact current fields**

```yaml
# curriculum/competencies/js.function.values.md frontmatter
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
```

```yaml
# curriculum/competencies/js.function.closure.md frontmatter
schemaVersion: 1
kind: competency
id: js.function.closure
slug: competencies/js/function-closure
title: Closure và private state
description: Giải thích và triển khai lexical closure cho private state
status: published
prerequisites:
  - js.function.values
requiredLevel: implement
assessments:
  - assessment-js-closure
remediation:
  - lesson-js-closure-private-state
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

- [ ] **Step 5: Add both lessons with exact current fields and rendered markers**

```yaml
# curriculum/lessons/lesson-js-function-values.md frontmatter
schemaVersion: 1
kind: lesson
id: lesson-js-function-values
slug: lessons/javascript/functions/function-values
title: Function values
description: Release 0 lesson fixture for function values
status: published
prerequisites: []
module: module-js-functions
competencies:
  - js.function.values
exercises: []
assessments:
  - assessment-js-function-values
sourceLanguage: vi
professionalArtifactLanguage: en
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

Its Markdown body contains the exact visible marker `RELEASE_ZERO_FUNCTION_VALUES_BODY`.

```yaml
# curriculum/lessons/lesson-js-closure-private-state.md frontmatter
schemaVersion: 1
kind: lesson
id: lesson-js-closure-private-state
slug: lessons/javascript/functions/closure-private-state
title: Closure private state
description: Release 0 lesson fixture for closure-backed private state
status: published
prerequisites:
  - lesson-js-function-values
module: module-js-functions
competencies:
  - js.function.closure
exercises: []
assessments:
  - assessment-js-closure
sourceLanguage: vi
professionalArtifactLanguage: en
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

Its Markdown body contains the exact visible marker `RELEASE_ZERO_CLOSURE_BODY`. The semantic ID `lesson-js-closure-private-state`, route ID `lessons/javascript/functions/closure-private-state`, competency ID `js.function.closure`, and file name are asserted as distinct contracts later.

- [ ] **Step 6: Add both assessments with exact current fields**

```yaml
# curriculum/assessments/assessment-js-function-values.md frontmatter
schemaVersion: 1
kind: assessment
id: assessment-js-function-values
slug: assessments/javascript/functions/function-values
title: Function values knowledge check
description: Release 0 assessment fixture for function values
status: published
prerequisites: []
assessmentType: knowledge-check
competencies:
  - js.function.values
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

```yaml
# curriculum/assessments/assessment-js-closure.md frontmatter
schemaVersion: 1
kind: assessment
id: assessment-js-closure
slug: assessments/javascript/functions/closure
title: Closure focused exercise
description: Release 0 assessment fixture for closure behavior
status: published
prerequisites:
  - assessment-js-function-values
assessmentType: focused-exercise
competencies:
  - js.function.closure
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

After each frontmatter block, use the exact one-paragraph fixture body:

| File | Exact Markdown body |
|---|---|
| `track-core.md` | `Release 0 pipeline fixture: track navigation only, not complete curriculum.` |
| `module-js-functions.md` | `Release 0 pipeline fixture: module ordering only, not complete curriculum.` |
| `js.function.values.md` | `Release 0 pipeline fixture: function-value competency only, not complete curriculum.` |
| `js.function.closure.md` | `Release 0 pipeline fixture: closure competency only, not complete curriculum.` |
| `lesson-js-function-values.md` | `RELEASE_ZERO_FUNCTION_VALUES_BODY — Release 0 pipeline fixture, not a complete lesson.` |
| `lesson-js-closure-private-state.md` | `RELEASE_ZERO_CLOSURE_BODY — Release 0 pipeline fixture, not a complete lesson.` |
| `assessment-js-function-values.md` | `Release 0 pipeline fixture: function-value assessment only, not complete curriculum.` |
| `assessment-js-closure.md` | `Release 0 pipeline fixture: closure assessment only, not complete curriculum.` |

- [ ] **Step 7: Validate GREEN and commit only the eight-document boundary**

```powershell
pnpm content:validate curriculum --format text
pnpm --filter @roadmap/docs test -- minimal-curriculum.test.ts
pnpm --filter @roadmap/docs test
git diff --check
git add -- curriculum/tracks/track-core.md curriculum/competencies/js.function.values.md curriculum/competencies/js.function.closure.md curriculum/modules/module-js-functions.md curriculum/lessons/lesson-js-function-values.md curriculum/lessons/lesson-js-closure-private-state.md curriculum/assessments/assessment-js-function-values.md curriculum/assessments/assessment-js-closure.md apps/docs/test/minimal-curriculum.test.ts
git diff --cached --name-only
git commit -m "content: add release zero curriculum spike"
```

Expected staged paths are exactly the nine files owned by Task 2.

### Task 3: Resolve runtime context and convert curriculum documents into Starlight entries

**Files:**
- Create: `apps/docs/src/lib/publication-channel.ts`
- Create: `apps/docs/src/lib/curriculum-runtime.ts`
- Create: `apps/docs/src/lib/create-doc-entries.ts`
- Create: `apps/docs/test/curriculum-runtime.test.ts`
- Create: `apps/docs/test/create-doc-entries.test.ts`

**Interfaces:**
- Consumes: `CurriculumCorpus`, the process environment, the Astro command, and an optional test root.
- Produces:
  - `parsePublicationChannel(value): PublicationChannel`
  - `resolveCurriculumRuntime(options): { curriculumRoot: string; channel: PublicationChannel }`
  - `createDocEntries(corpus, options): readonly CurriculumDocEntry[]`
- The public `sourcePath` is canonical metadata `curriculum/<path-within-active-root>`, never an absolute path and never a temporary-directory path.

- [ ] **Step 1: Write RED tests for fail-closed channels and the shared root**

```ts
// apps/docs/test/curriculum-runtime.test.ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveCurriculumRuntime,
  resolveDefaultCurriculumRoot,
} from '../src/lib/curriculum-runtime.js';
import { parsePublicationChannel } from '../src/lib/publication-channel.js';

describe('publication channel and curriculum root', () => {
  it.each(['development', 'preview', 'production'] as const)(
    'accepts explicit channel %s',
    (channel) => expect(parsePublicationChannel(channel)).toBe(channel),
  );

  it('fails closed for an invalid explicit channel', () => {
    expect(() => parsePublicationChannel('prod')).toThrow(/Invalid ROADMAP_PUBLICATION_CHANNEL/);
  });

  it('defaults dev to development and static build to production', () => {
    expect(resolveCurriculumRuntime({ astroCommand: 'dev', explicitChannel: undefined }).channel)
      .toBe('development');
    expect(resolveCurriculumRuntime({ astroCommand: 'build', explicitChannel: undefined }).channel)
      .toBe('production');
  });

  it('resolves the repository curriculum root and honors an explicit test root', () => {
    expect(resolveDefaultCurriculumRoot().split(path.sep).join('/')).toMatch(/\/curriculum\/$/);
    expect(
      resolveCurriculumRuntime({
        astroCommand: 'dev',
        explicitRoot: 'D:\\test-owned\\curriculum',
      }).curriculumRoot,
    ).toBe(path.resolve('D:\\test-owned\\curriculum'));
  });
});
```

```powershell
pnpm --filter @roadmap/docs test -- curriculum-runtime.test.ts
```

Expected: failure because both modules are absent.

- [ ] **Step 2: Implement exact visibility and fail-closed parsing**

```ts
// apps/docs/src/lib/publication-channel.ts
import type { CurriculumEntity } from '@roadmap/curriculum-schema';

export type PublicationChannel = 'development' | 'preview' | 'production';
type PublicationStatus = CurriculumEntity['status'];

const channelValues = new Set<PublicationChannel>(['development', 'preview', 'production']);
const visible: Record<PublicationChannel, ReadonlySet<PublicationStatus>> = {
  development: new Set(['draft', 'review', 'published', 'deprecated', 'withdrawn']),
  preview: new Set(['review', 'published', 'deprecated', 'withdrawn']),
  production: new Set(['published', 'deprecated', 'withdrawn']),
};

export function parsePublicationChannel(value: string): PublicationChannel {
  if (!channelValues.has(value as PublicationChannel)) {
    throw new Error(`Invalid ROADMAP_PUBLICATION_CHANNEL: ${value}`);
  }
  return value as PublicationChannel;
}

export function isVisible(status: PublicationStatus, channel: PublicationChannel): boolean {
  return visible[channel].has(status);
}
```

Add a table-driven test covering all five statuses in all three channels.

- [ ] **Step 3: Implement the one shared runtime resolver**

```ts
// apps/docs/src/lib/curriculum-runtime.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parsePublicationChannel,
  type PublicationChannel,
} from './publication-channel.js';

export interface ResolveCurriculumRuntimeOptions {
  astroCommand?: string;
  explicitChannel?: string;
  explicitRoot?: string;
}

export function resolveDefaultCurriculumRoot(): string {
  return fileURLToPath(new URL('../../../../curriculum/', import.meta.url));
}

export function resolveCurriculumRuntime(
  options: ResolveCurriculumRuntimeOptions = {},
): { curriculumRoot: string; channel: PublicationChannel } {
  const explicitChannel =
    options.explicitChannel ?? process.env.ROADMAP_PUBLICATION_CHANNEL;
  const astroCommand = options.astroCommand ?? process.argv[2];
  const channel = explicitChannel
    ? parsePublicationChannel(explicitChannel)
    : astroCommand === 'dev'
      ? 'development'
      : 'production';
  const explicitRoot = options.explicitRoot ?? process.env.ROADMAP_CURRICULUM_ROOT;
  return {
    curriculumRoot: explicitRoot
      ? path.resolve(explicitRoot)
      : resolveDefaultCurriculumRoot(),
    channel,
  };
}

export const curriculumRuntime = resolveCurriculumRuntime();
```

Both Task 4 content registration and Task 5 sidebar loading import `curriculumRuntime`; neither computes its own relative root or publication fallback.

- [ ] **Step 4: Write RED tests for route IDs, source paths, body retention, and filtering**

The focused test loads the Task 2 corpus and asserts:

```ts
const entries = createDocEntries(corpus.value, {
  channel: 'production',
  curriculumRoot,
});
const closure = entries.find(({ data }) => data.semanticId === 'lesson-js-closure-private-state');

expect(closure?.id).toBe('lessons/javascript/functions/closure-private-state');
expect(closure?.id).not.toBe(closure?.data.semanticId);
expect(closure?.filePath).toMatch(/lesson-js-closure-private-state\.md$/);
expect(closure?.body).toContain('RELEASE_ZERO_CLOSURE_BODY');
expect(closure?.data.sourcePath)
  .toBe('curriculum/lessons/lesson-js-closure-private-state.md');
expect(closure?.data.sourcePath).not.toContain(curriculumRoot);
```

The test also uses a synthetic corpus with every publication status to prove the exact development, preview, and production sets.

```powershell
pnpm --filter @roadmap/docs test -- create-doc-entries.test.ts
```

Expected: failure because the adapter is absent.

- [ ] **Step 5: Implement the framework-free entry adapter**

`apps/docs/src/lib/create-doc-entries.ts` imports only Node and domain packages. It does not import Astro or Starlight types. Its entry contract is:

```ts
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
```

Build `sourcePath` from the path inside the active root, then prefix `curriculum/`:

```ts
const sourceWithinRoot = path
  .relative(options.curriculumRoot, document.filePath)
  .split(path.sep)
  .join('/');
const sourcePath = `curriculum/${sourceWithinRoot}`;
```

Reject any `sourceWithinRoot` that is absolute, equals `..`, or starts with `../`. Filter with `isVisible()`, preserve raw `body` for Task 4 rendering, keep semantic metadata, and sort entries deterministically by route ID.

- [ ] **Step 6: Run GREEN and commit the adapter boundary**

```powershell
pnpm --filter @roadmap/docs test -- curriculum-runtime.test.ts create-doc-entries.test.ts
pnpm --filter @roadmap/docs test
pnpm typecheck
git diff --check
git add -- apps/docs/src/lib/publication-channel.ts apps/docs/src/lib/curriculum-runtime.ts apps/docs/src/lib/create-doc-entries.ts apps/docs/test/curriculum-runtime.test.ts apps/docs/test/create-doc-entries.test.ts
git diff --cached --name-only
git commit -m "feat: adapt curriculum documents for starlight"
```

Expected staged paths are exactly the five files owned by Task 3.

### Task 4: Implement the Astro custom loader and extended Starlight schema

**Files:**
- Create: `apps/docs/src/content-loader/curriculum-docs-loader.ts`
- Create: `apps/docs/src/content.config.ts`
- Create: `apps/docs/test/content-loader.test.ts`

**Interfaces:**
- Consumes: `createDocEntries()`, `curriculumRuntime`, `loadCurriculum()`, and Astro's build-time `Loader` context.
- Produces: `curriculumDocsLoader(options): Loader`, rendered Starlight content entries, and the registered `docs` collection.
- The loader serializes complete reloads and owns one scoped listener set per watcher.

- [ ] **Step 1: Write a RED loader-store test**

The test double records `clear`, `set`, `parseData`, `renderMarkdown`, and `generateDigest`. After `load()`:

```ts
expect(parseData).toHaveBeenCalled();
expect(renderMarkdown).toHaveBeenCalledWith(
  expect.stringContaining('RELEASE_ZERO_CLOSURE_BODY'),
  expect.objectContaining({ fileURL: expect.any(URL) }),
);
expect(generateDigest).toHaveBeenCalled();
expect(set).toHaveBeenCalledWith(
  expect.objectContaining({
    id: 'lessons/javascript/functions/closure-private-state',
    body: expect.stringContaining('RELEASE_ZERO_CLOSURE_BODY'),
    rendered: expect.objectContaining({
      html: expect.stringContaining('RELEASE_ZERO_CLOSURE_BODY'),
    }),
    digest: expect.any(String),
  }),
);
```

A watcher test invokes `load()` twice with the same watcher and proves:

```ts
expect(watcher.add).toHaveBeenCalledWith(curriculumRoot);
expect(watcher.on.mock.calls.map(([event]) => event)).toEqual(['add', 'change', 'unlink']);
```

It invokes callbacks for one path under the root and one outside it, then proves inside-root events serialize complete reloads while the outside path causes no reload. The second `load()` must not add duplicate handlers.

```powershell
pnpm --filter @roadmap/docs test -- content-loader.test.ts
```

Expected: failure because the custom loader is absent.

- [ ] **Step 2: Implement a complete rendered reload**

Inside `curriculumDocsLoader()`, keep the latest loader context and a promise queue. The complete reload must:

1. call `loadCurriculum(options.curriculumRoot)` and throw with diagnostics on failure;
2. call `store.clear()`;
3. call `parseData({ id, data })` for every visible entry;
4. call `renderMarkdown(entry.body, { fileURL: pathToFileURL(entry.filePath) })`;
5. call `generateDigest({ data, body: entry.body })`;
6. call `store.set({ id, data, body, rendered, filePath, digest })`.

Use this exact data-store shape:

```ts
const data = await parseData({ id: entry.id, data: entry.data });
const rendered = await renderMarkdown(entry.body, {
  fileURL: pathToFileURL(entry.filePath),
});
const digest = generateDigest({ data, body: entry.body });
store.set({
  id: entry.id,
  data,
  body: entry.body,
  rendered,
  filePath: entry.filePath,
  digest,
});
```

Do not substitute a hand-written hash or store only raw `body`.

- [ ] **Step 3: Register scoped serialized watcher callbacks**

Call `watcher.add(options.curriculumRoot)`. Register `add`, `change`, and `unlink` callbacks that:

- ignore any path outside the resolved curriculum root;
- append one complete reload to a shared promise queue;
- log and surface reload failures;
- never overlap reloads;
- are registered once for a watcher and removed from an old watcher with `off()` before a replacement watcher is registered.

Use one queue and retain the latest loader context inside the loader closure:

```ts
let latestContext: Parameters<NonNullable<Loader['load']>>[0] | undefined;
let activeWatcher: Parameters<NonNullable<Loader['load']>>[0]['watcher'];
let listeners:
  | {
      add: (filePath: string) => void;
      change: (filePath: string) => void;
      unlink: (filePath: string) => void;
    }
  | undefined;
let reloadQueue = Promise.resolve();

function isInsideRoot(filePath: string): boolean {
  const relative = path.relative(options.curriculumRoot, path.resolve(filePath));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function enqueueReload(filePath: string): void {
  if (!isInsideRoot(filePath) || latestContext === undefined) return;
  reloadQueue = reloadQueue.then(() => reload(latestContext!)).catch((error: unknown) => {
    latestContext?.logger.error(
      error instanceof Error ? error.message : String(error),
    );
    queueMicrotask(() => {
      throw error;
    });
  });
}

function detachWatcher(): void {
  if (activeWatcher === undefined || listeners === undefined) return;
  activeWatcher.off('add', listeners.add);
  activeWatcher.off('change', listeners.change);
  activeWatcher.off('unlink', listeners.unlink);
}

function attachWatcher(watcher: NonNullable<typeof activeWatcher>): void {
  if (watcher === activeWatcher) return;
  detachWatcher();
  listeners = {
    add: enqueueReload,
    change: enqueueReload,
    unlink: enqueueReload,
  };
  activeWatcher = watcher;
  watcher.add(options.curriculumRoot);
  watcher.on('add', listeners.add);
  watcher.on('change', listeners.change);
  watcher.on('unlink', listeners.unlink);
}
```

The returned loader's `load(context)` assigns `latestContext = context`, awaits `reload(context)`, and then calls `attachWatcher(context.watcher)` when a watcher exists.

Do not use `watcher.add(root)` without callbacks and do not accumulate listeners when Astro calls `load()` again.

- [ ] **Step 4: Register the `docs` collection with the current schema contract**

```ts
// apps/docs/src/content.config.ts
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
```

This is the only collection registration. No `apps/docs/src/content/docs` directory is created.

- [ ] **Step 5: Run focused and real framework gates**

Use PowerShell environment assignment only when an explicit override is required:

```powershell
pnpm --filter @roadmap/docs test -- content-loader.test.ts
pnpm docs:check
pnpm docs:build
$env:ROADMAP_PUBLICATION_CHANNEL='development'
try {
  pnpm docs:build
} finally {
  Remove-Item Env:ROADMAP_PUBLICATION_CHANNEL -ErrorAction SilentlyContinue
}
pnpm --filter @roadmap/docs test -- no-local-copy.test.ts
git diff --check
```

The default static build is production. Both builds exit `0`, a published route renders `RELEASE_ZERO_CLOSURE_BODY`, and `apps/docs/src/content/docs` remains absent.

- [ ] **Step 6: Commit only loader and collection registration**

```powershell
git add -- apps/docs/src/content-loader/curriculum-docs-loader.ts apps/docs/src/content.config.ts apps/docs/test/content-loader.test.ts
git diff --cached --name-only
git commit -m "feat: load curriculum through astro content layer"
```

Expected staged paths are exactly the three files owned by Task 4.

### Task 5: Derive sidebar, dependency links, and metadata through a named override

**Files:**
- Create: `apps/docs/src/lib/sidebar.ts`
- Create: `apps/docs/src/lib/dependency-links.ts`
- Create: `apps/docs/test/sidebar.test.ts`
- Create: `apps/docs/test/dependency-links.test.ts`
- Create: `apps/docs/src/components/PageTitle.astro`
- Create: `apps/docs/src/components/CurriculumMetadata.astro`
- Create: `apps/docs/src/components/DependencyLinks.astro`
- Modify surgically: `apps/docs/astro.config.mjs`

**Interfaces:**
- Consumes: validated curriculum graph, `curriculumRuntime`, the loaded `docs` collection, and Starlight's default `PageTitle`.
- Produces:
  - `buildSidebar(corpus, channel): readonly SidebarItem[]`
  - `loadSidebar(runtime): Promise<readonly SidebarItem[]>`
  - `resolveDependencyLinks(entries, semanticIds)`
  - a named Starlight `PageTitle` override that preserves the default `<h1 id="_top">` accessibility contract and appends curriculum metadata.

- [ ] **Step 1: Write discriminating RED tests for navigation order**

`sidebar.test.ts` loads the real corpus and proves the configured module lesson order differs from lexical order:

```ts
const sidebar = buildSidebar(corpus.value, 'production');
const lessonLinks = sidebar[0]?.items[0]?.items.map((item) => item.link);
expect(lessonLinks).toEqual([
  '/lessons/javascript/functions/function-values/',
  '/lessons/javascript/functions/closure-private-state/',
]);
expect([...lessonLinks].sort()).not.toEqual(lessonLinks);
```

It also proves `loadSidebar(curriculumRuntime)` uses the shared root/channel resolver and validates both `buildCurriculumGraph()` and `validateCurriculumGraph()` before returning navigation.

- [ ] **Step 2: Write RED tests for semantic dependency resolution**

`dependency-links.test.ts` passes loaded entries and semantic prerequisite IDs to `resolveDependencyLinks()`:

```ts
expect(resolveDependencyLinks(entries, ['lesson-js-function-values'])).toEqual([
  {
    semanticId: 'lesson-js-function-values',
    href: '/lessons/javascript/functions/function-values/',
    label: 'Function values',
  },
]);
expect(() => resolveDependencyLinks(entries, ['missing-id'])).toThrow(
  /Unresolved curriculum dependency: missing-id/,
);
```

No test or implementation hard-codes a semantic-ID-to-URL table.

```powershell
pnpm --filter @roadmap/docs test -- sidebar.test.ts dependency-links.test.ts
```

Expected: failure because the sidebar and dependency resolver are absent.

- [ ] **Step 3: Implement navigation from explicit arrays**

`buildSidebar()` indexes documents by stable ID, filters publication visibility, walks each track's `modules` array and each module's `lessons` array in declared order, and maps visible lesson slugs to links. Missing, wrong-kind, or invisible required nodes throw with the declaring ID. `loadSidebar()` uses `loadCurriculum(runtime.curriculumRoot)`, `buildCurriculumGraph()`, and `validateCurriculumGraph()` before calling `buildSidebar()`.

The module's `[lesson-js-function-values, lesson-js-closure-private-state]` order is preserved exactly; never sort it lexically.

```ts
// apps/docs/src/lib/sidebar.ts
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import type { CurriculumCorpus } from '@roadmap/curriculum-schema';
import type { PublicationChannel } from './publication-channel.js';
import { isVisible } from './publication-channel.js';

export interface SidebarLink {
  label: string;
  link: string;
}

export interface SidebarGroup {
  label: string;
  items: readonly (SidebarGroup | SidebarLink)[];
}

export function buildSidebar(
  corpus: CurriculumCorpus,
  channel: PublicationChannel,
): readonly SidebarGroup[] {
  const byId = new Map(corpus.documents.map((document) => [document.data.id, document]));
  const tracks = corpus.documents.filter(
    (document) =>
      document.data.kind === 'track' && isVisible(document.data.status, channel),
  );

  return tracks.map(({ data: track }) => ({
    label: track.title,
    items: track.modules.map((moduleId) => {
      const moduleDocument = byId.get(moduleId);
      if (moduleDocument?.data.kind !== 'module') {
        throw new Error(`Track ${track.id} has unresolved module: ${moduleId}`);
      }
      if (!isVisible(moduleDocument.data.status, channel)) {
        throw new Error(`Track ${track.id} has invisible module: ${moduleId}`);
      }
      return {
        label: moduleDocument.data.title,
        items: moduleDocument.data.lessons.map((lessonId) => {
          const lesson = byId.get(lessonId);
          if (lesson?.data.kind !== 'lesson') {
            throw new Error(`Module ${moduleId} has unresolved lesson: ${lessonId}`);
          }
          if (!isVisible(lesson.data.status, channel)) {
            throw new Error(`Module ${moduleId} has invisible lesson: ${lessonId}`);
          }
          return { label: lesson.data.title, link: `/${lesson.data.slug}/` };
        }),
      };
    }),
  }));
}

export async function loadSidebar(runtime: {
  curriculumRoot: string;
  channel: PublicationChannel;
}): Promise<readonly SidebarGroup[]> {
  const corpus = await loadCurriculum(runtime.curriculumRoot);
  if (!corpus.ok) throw new Error(JSON.stringify(corpus.diagnostics));
  const graph = buildCurriculumGraph(corpus.value);
  if (!graph.ok) throw new Error(JSON.stringify(graph.diagnostics));
  const validation = validateCurriculumGraph(graph.value);
  if (!validation.ok) throw new Error(JSON.stringify(validation.diagnostics));
  return buildSidebar(corpus.value, runtime.channel);
}
```

- [ ] **Step 4: Implement the metadata and dependency components**

`CurriculumMetadata.astro` renders these public fields from current route data:

```text
Stable ID
Publication status
Source path
Last reviewed version
```

`DependencyLinks.astro` calls `getCollection('docs')`, builds its mapping from each loaded entry's `data.semanticId`, and resolves the current entry's prerequisite IDs through `resolveDependencyLinks()`. It never hard-codes URLs and fails closed on an unresolved prerequisite.

```ts
// apps/docs/src/lib/dependency-links.ts
export interface DependencyEntry {
  id: string;
  data: { semanticId: string; title: string };
}

export function resolveDependencyLinks(
  entries: readonly DependencyEntry[],
  semanticIds: readonly string[],
): readonly { semanticId: string; href: string; label: string }[] {
  const bySemanticId = new Map(entries.map((entry) => [entry.data.semanticId, entry]));
  return semanticIds.map((semanticId) => {
    const target = bySemanticId.get(semanticId);
    if (target === undefined) {
      throw new Error(`Unresolved curriculum dependency: ${semanticId}`);
    }
    return {
      semanticId,
      href: `/${target.id}/`,
      label: target.data.title,
    };
  });
}
```

```astro
---
// apps/docs/src/components/CurriculumMetadata.astro
interface Props {
  data: {
    semanticId: string;
    publicationStatus: string;
    sourcePath: string;
    lastReviewedIn: string;
  };
}

const { data } = Astro.props;
---

<dl class="curriculum-metadata">
  <div><dt>Stable ID</dt><dd>{data.semanticId}</dd></div>
  <div><dt>Publication status</dt><dd>{data.publicationStatus}</dd></div>
  <div><dt>Source path</dt><dd>{data.sourcePath}</dd></div>
  <div><dt>Last reviewed version</dt><dd>{data.lastReviewedIn}</dd></div>
</dl>
```

```astro
---
// apps/docs/src/components/DependencyLinks.astro
import { getCollection, type CollectionEntry } from 'astro:content';
import { resolveDependencyLinks } from '../lib/dependency-links.js';

interface Props {
  entry: CollectionEntry<'docs'>;
}

const { entry } = Astro.props;
const entries = await getCollection('docs');
const links = resolveDependencyLinks(entries, entry.data.prerequisites);
---

{
  links.length > 0 && (
    <nav class="curriculum-dependencies" aria-label="Curriculum prerequisites">
      <h2>Prerequisites</h2>
      <ul>
        {links.map((link) => (
          <li><a href={link.href}>{link.label}</a></li>
        ))}
      </ul>
    </nav>
  )
}
```

- [ ] **Step 5: Preserve Starlight accessibility through a named `PageTitle` override**

```astro
---
// apps/docs/src/components/PageTitle.astro
import Default from '@astrojs/starlight/components/PageTitle.astro';
import CurriculumMetadata from './CurriculumMetadata.astro';
import DependencyLinks from './DependencyLinks.astro';

const { entry } = Astro.locals.starlightRoute;
---

<Default><slot /></Default>
<CurriculumMetadata data={entry.data} />
<DependencyLinks entry={entry} />
```

Reusing the default component preserves its `<h1 id="_top">` contract. Do not replace it with a custom heading.

- [ ] **Step 6: Surgically merge sidebar and component override into Starlight config**

At the top of `apps/docs/astro.config.mjs`, import the same shared runtime and pre-config loader:

```js
import { curriculumRuntime } from './src/lib/curriculum-runtime.js';
import { loadSidebar } from './src/lib/sidebar.js';

const sidebar = await loadSidebar(curriculumRuntime);
```

Merge only these keys into the existing `starlight({ ... })` options:

```js
{
  sidebar,
  components: {
    PageTitle: './src/components/PageTitle.astro',
  },
}
```

Preserve `title`, `customCss`, static output, and all existing integration settings. The config reads authoritative curriculum directly through domain packages and writes no generated navigation file.

- [ ] **Step 7: Run GREEN, build, and commit the presentation boundary**

```powershell
pnpm --filter @roadmap/docs test -- sidebar.test.ts dependency-links.test.ts
pnpm --filter @roadmap/docs test
pnpm docs:check
pnpm docs:build
pnpm --filter @roadmap/docs test -- no-local-copy.test.ts
git diff --check
git add -- apps/docs/src/lib/sidebar.ts apps/docs/src/lib/dependency-links.ts apps/docs/test/sidebar.test.ts apps/docs/test/dependency-links.test.ts apps/docs/src/components/PageTitle.astro apps/docs/src/components/CurriculumMetadata.astro apps/docs/src/components/DependencyLinks.astro apps/docs/astro.config.mjs
git diff --cached --name-only
git commit -m "feat: derive docs navigation from curriculum graph"
```

Expected staged paths are exactly the eight files owned by Task 5.

### Task 6: Prove production filtering, hot reload, accessibility, and static routes

**Files:**
- Create: `apps/docs/playwright.config.ts`
- Create: `apps/docs/e2e/docs.spec.ts`
- Create: `apps/docs/test/hot-reload.integration.test.ts`
- Create: `curriculum/lessons/lesson-release-zero-draft.md`
- Create: `scripts/verify-wp-04.mjs`
- Modify: `apps/docs/test/minimal-curriculum.test.ts`
- Modify surgically: `package.json`
- Modify through pnpm only if dependency metadata changes: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: the static Starlight build, local Astro preview, the shared runtime seam, the retained Task 2 corpus test, and root `runPipeline()`.
- Produces: exactly nine total documents, exactly eight production-visible documents, exactly one draft, `pnpm docs:test:e2e`, `pnpm verify:wp-04`, generated-route inspection, temporary-copy hot-reload evidence, and Spike 1 review evidence.

- [ ] **Step 1: Modify the retained corpus test first and record RED**

Update `apps/docs/test/minimal-curriculum.test.ts`; do not create a second corpus test. Its final assertions are:

```ts
expect(corpus.value.documents).toHaveLength(9);
expect(corpus.value.documents.filter(({ data }) => data.status === 'draft')).toHaveLength(1);
expect(
  createDocEntries(corpus.value, { channel: 'production', curriculumRoot }),
).toHaveLength(8);
expect(
  createDocEntries(corpus.value, { channel: 'development', curriculumRoot }),
).toHaveLength(9);
expect(
  corpus.value.documents.some(({ data }) => data.id === 'lesson-release-zero-draft'),
).toBe(true);
```

Retain Task 2's exact ID, module-order, build-graph, and validate-graph assertions.

```powershell
pnpm --filter @roadmap/docs test -- minimal-curriculum.test.ts
```

Expected: failure because the ninth document is absent.

- [ ] **Step 2: Add the exact ninth document**

```yaml
# curriculum/lessons/lesson-release-zero-draft.md frontmatter
schemaVersion: 1
kind: lesson
id: lesson-release-zero-draft
slug: lessons/release-zero/draft
title: Release Zero draft
description: Draft-only route fixture for publication filtering
status: draft
prerequisites:
  - lesson-js-function-values
module: module-js-functions
competencies:
  - js.function.values
exercises: []
assessments:
  - assessment-js-function-values
sourceLanguage: vi
professionalArtifactLanguage: en
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
```

Its exact Markdown body is `RELEASE_ZERO_DRAFT_BODY — Release 0 draft-only pipeline fixture, not a complete lesson.` Do not add the draft lesson to the published module's `lessons` array; published content must not depend on draft content.

- [ ] **Step 3: Configure package-pinned Chromium and static preview**

```ts
// apps/docs/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4321',
  },
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

`docs:test:e2e` builds first; Playwright then starts `astro preview` through `webServer`. Preview serves the last static `dist` build and is not production hosting. Do not use deprecated `webServer.port`.

- [ ] **Step 4: Write discriminating production browser tests**

`apps/docs/e2e/docs.spec.ts` independently proves:

```ts
test('published route renders body, distinct IDs, source metadata, and skip link', async ({ page }) => {
  const response = await page.goto('/lessons/javascript/functions/closure-private-state/');
  expect(response?.status()).toBe(200);
  await expect(page.getByText('RELEASE_ZERO_CLOSURE_BODY')).toBeVisible();
  await expect(page.getByText('lesson-js-closure-private-state')).toBeVisible();
  await expect(
    page.getByText('curriculum/lessons/lesson-js-closure-private-state.md'),
  ).toBeVisible();
  expect(page.url()).not.toContain('lesson-js-closure-private-state');
  await expect(page.locator('h1#_top')).toBeVisible();
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
});

test('draft route is absent from a production build', async ({ page }) => {
  const response = await page.goto('/lessons/release-zero/draft/');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('RELEASE_ZERO_DRAFT_BODY')).toHaveCount(0);
});
```

Add a sidebar assertion proving `Function values` appears before `Closure private state`.

- [ ] **Step 5: Write the Windows-safe temporary-root hot-reload integration**

`apps/docs/test/hot-reload.integration.test.ts` must:

1. snapshot SHA-256 hashes for every authoritative `curriculum/**/*.md` file and snapshot `git status --short` output;
2. create a unique directory with `mkdtemp(path.join(tmpdir(), 'wp04-hot-reload-'))`;
3. copy the authoritative corpus into `<temp>/curriculum`;
4. start Astro dev with `shell: false`, `windowsHide: true`, `ROADMAP_CURRICULUM_ROOT=<temp>/curriculum`, and `ROADMAP_PUBLICATION_CHANNEL=development`;
5. invoke pnpm through `process.execPath` and `process.env.npm_execpath`, failing closed if `npm_execpath` is absent;
6. wait for the fixed test URL with bounded polling;
7. prove `/lessons/release-zero/draft/` returns `200` and renders `RELEASE_ZERO_DRAFT_BODY`;
8. request the closure route and prove the initial rendered marker;
9. append a unique marker only to the copied closure file;
10. poll until the rendered route contains that marker;
11. in `finally`, stop the complete child tree and delete only the verified temporary directory;
12. compare authoritative hashes and Git status to the snapshots and prove they are unchanged.

Windows cleanup uses `taskkill.exe /PID <pid> /T /F`, waits for the child exit, and fails if the process remains. Non-Windows cleanup may use `SIGTERM` followed by bounded `SIGKILL`; no Windows path relies on Unix signals. Before recursive deletion, resolve the candidate and prove it is below the resolved OS temp directory and contains the `wp04-hot-reload-` prefix.

The test never writes to authoritative `curriculum/`, never restores a tracked file because it never mutates one, and performs cleanup even when an assertion fails.

Use the package-manager path directly and never invoke a shell:

```ts
const npmExecPath = process.env.npm_execpath;
if (npmExecPath === undefined) {
  throw new Error('npm_execpath is required for a shell-free pnpm child process');
}

const child = spawn(
  process.execPath,
  [
    npmExecPath,
    '--filter',
    '@roadmap/docs',
    'dev',
    '--',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ROADMAP_CURRICULUM_ROOT: temporaryCurriculumRoot,
      ROADMAP_PUBLICATION_CHANNEL: 'development',
    },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
```

Use an awaited tree-stop helper:

```ts
async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null) return true;
  return Promise.race([
    once(child, 'exit').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
  ]);
}

async function stopChildTree(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    const result = spawnSync(
      'taskkill.exe',
      ['/PID', String(child.pid), '/T', '/F'],
      { shell: false, windowsHide: true, stdio: 'pipe' },
    );
    if (result.status !== 0 && child.exitCode === null) {
      throw new Error(`taskkill failed with status ${result.status}`);
    }
  } else {
    child.kill('SIGTERM');
  }
  if (await waitForExit(child, 10_000)) return;
  if (process.platform !== 'win32') {
    child.kill('SIGKILL');
    if (await waitForExit(child, 5_000)) return;
  }
  throw new Error('Astro child tree did not exit');
}
```

The `finally` block calls `stopChildTree()` before guarded temporary-directory removal, then performs the authoritative hash and Git-state comparisons.

- [ ] **Step 6: Surgically merge the final root command graph**

Add the two new root scripts:

```json
{
  "scripts": {
    "docs:test:e2e": "pnpm docs:build && pnpm --filter @roadmap/docs test:e2e",
    "verify:wp-04": "node scripts/verify-wp-04.mjs"
  }
}
```

Surgically replace only these two existing root script values:

```json
{
  "scripts": {
    "check": "node scripts/run-pipeline.mjs format:check lint typecheck policy:check docs:check",
    "verify": "node scripts/run-pipeline.mjs check test content:validate:curriculum schema:check docs:build"
  }
}
```

Preserve `pnpm test` exactly as `node scripts/run-pipeline.mjs test:bootstrap test:unit`, preserve all WP-00–03 direct gates and verifiers, and preserve the fail-closed `verify:templates` and `verify:release` commands. The root unit suite runs exactly once in `verify:wp-04`.

- [ ] **Step 7: Add the WP-04 gate with artifact and boundary inspection**

```js
// scripts/verify-wp-04.mjs
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './run-pipeline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publishedRoute = path.join(
  root,
  'apps/docs/dist/lessons/javascript/functions/closure-private-state/index.html',
);
const draftRoute = path.join(root, 'apps/docs/dist/lessons/release-zero/draft/index.html');
const localCopy = path.join(root, 'apps/docs/src/content/docs');

await runPipeline(
  ['check', 'test', 'content:validate:curriculum', 'schema:check', 'docs:test:e2e'],
  { cwd: root },
);

await access(publishedRoute);
const publishedHtml = await readFile(publishedRoute, 'utf8');
if (!publishedHtml.includes('RELEASE_ZERO_CLOSURE_BODY')) {
  throw new Error('Published route artifact does not contain rendered curriculum body');
}
await access(draftRoute).then(
  () => {
    throw new Error('Draft route artifact exists in the production build');
  },
  () => undefined,
);
await access(localCopy).then(
  () => {
    throw new Error('Hand-maintained apps/docs/src/content/docs copy exists');
  },
  () => undefined,
);
```

This gate inspects generated production artifacts after the browser gate and checks the no-local-copy boundary. It does not rerun the unit suite.

- [ ] **Step 8: Run the complete Task 6 evidence set**

```powershell
pnpm exec playwright install chromium
pnpm --filter @roadmap/docs test -- minimal-curriculum.test.ts hot-reload.integration.test.ts
pnpm docs:check
pnpm docs:test:e2e
pnpm verify:wp-04
pnpm verify:wp-00-01
pnpm verify:wp-02-03
pnpm test:wp-00-01-gate
pnpm verify:templates
pnpm verify:release
git diff --check
```

Expected: normal gates exit `0`. `verify:templates` and `verify:release` intentionally exit `2` and are recorded as unavailable, not as passes. Stop immediately on any unexpected exit or changed tracked path outside the Task 6 file map.

- [ ] **Step 9: Commit only the final evidence boundary**

```powershell
git add -- apps/docs/playwright.config.ts apps/docs/e2e/docs.spec.ts apps/docs/test/hot-reload.integration.test.ts apps/docs/test/minimal-curriculum.test.ts curriculum/lessons/lesson-release-zero-draft.md scripts/verify-wp-04.mjs package.json pnpm-lock.yaml
git diff --cached --name-only
git commit -m "test: prove curriculum to starlight spike"
```

If `pnpm-lock.yaml` did not change in Task 6, do not stage it. Every staged path must belong to the Task 6 file map.

## Final reviewer-only discrimination

The final reviewer, not the implementation worker, performs the production-filter mutation in a disposable external worktree. Never perform it in the frozen WP-04 worktree.

1. Verify `D:\Programming\Repos\fullstack-javascript-roadmap-worktrees\wp-04-production-filter-review` does not exist.
2. Create that external worktree detached at the final WP-04 commit.
3. Change only the disposable copy of `apps/docs/src/lib/publication-channel.ts` so production temporarily includes `draft`.
4. Run the single production draft-route Playwright test and record the required non-zero result because the route becomes available.
5. Revert that exact temporary line in the disposable copy, prove its tracked/index/untracked state is clean, and remove the worktree non-force.
6. Record the mutation evidence without committing or transferring the mutation.

WP-04 is complete only when all six task commits exist, `pnpm verify:wp-04` passes, the generated production route set includes the published route and omits the draft route, the named skip-link evidence passes, `apps/docs/src/content/docs` remains absent, authoritative curriculum hashes remain unchanged during hot reload, and the reviewer records the disposable-worktree mutation failure.
