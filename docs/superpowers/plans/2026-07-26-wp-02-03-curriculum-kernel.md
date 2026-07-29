# WP-02–03 Curriculum Schema and Graph Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the canonical curriculum schemas, file loader, stable-ID registry, dependency graph, semantic validators, JSON Schema generation, and structured diagnostics required by Release 0 Spike 2.

**Architecture:** `validation-core` owns diagnostic and outcome primitives. `curriculum-schema` owns canonical Zod schemas and inferred TypeScript types. `curriculum-loader` reads Markdown frontmatter into validated documents without website dependencies. `curriculum-graph` resolves semantic relationships and rejects invalid graphs. A thin CLI under `tooling/validate-content` composes the packages and becomes the root `content:validate` command.

**Tech Stack:** TypeScript strict mode, Zod 4, YAML frontmatter, Node.js filesystem APIs, Vitest projects, SHA-256 from `node:crypto`, and generated JSON Schema.

## Global Constraints

- Domain packages never depend on `apps/docs`
- Every package is ESM, private, and imported through `workspace:*`
- Competency IDs use dotted semantic IDs; curriculum artifact IDs use kind-prefixed kebab IDs
- Schema validation, graph validation, and artifact execution remain separate layers
- Every failure uses the shared `Diagnostic` shape
- Every important validator has valid and invalid fixtures
- Published content may not depend on draft or review content
- A validator exception must become a stable `VALIDATOR_INTERNAL_001` error and a non-zero CLI exit
- Generated JSON Schema is derived from canonical Zod schemas and drift-checked

---

## File map

```text
packages/validation-core/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/diagnostic.ts
├── src/outcome.ts
├── src/internal-error.ts
├── src/index.ts
└── test/validation-core.test.ts

packages/curriculum-schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/ids.ts
├── src/common.ts
├── src/entities.ts
├── src/document.ts
├── src/json-schema.ts
├── src/index.ts
├── generated/curriculum.schema.json
└── test/schema.test.ts

packages/curriculum-loader/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/frontmatter.ts
├── src/load-file.ts
├── src/load-curriculum.ts
├── src/index.ts
└── test/loader.test.ts

packages/curriculum-graph/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/types.ts
├── src/registry.ts
├── src/references.ts
├── src/edges.ts
├── src/cycles.ts
├── src/publication.ts
├── src/completeness.ts
├── src/validate.ts
├── src/index.ts
└── test/
    ├── registry.test.ts
    ├── references.test.ts
    ├── cycles.test.ts
    ├── publication.test.ts
    ├── completeness.test.ts
    └── support/

tooling/validate-content/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/main.ts
└── test/cli.test.ts

scripts/
└── generate-json-schema.ts

fixtures/curriculum/
├── valid/minimal/
└── invalid/
    ├── duplicate-id/
    ├── missing-reference/
    ├── missing-module-competency/
    ├── missing-module-milestone/
    ├── self-cycle/
    ├── two-node-cycle/
    ├── multi-node-cycle/
    ├── published-to-draft/
    ├── published-to-draft-reverse/
    ├── published-to-review-reverse/
    ├── orphan-competency/
    ├── unreachable-milestone/
    ├── missing-assessment/
    ├── missing-remediation/
```

### Task 1: Implement `validation-core`

**Files:**
- Create: `packages/validation-core/package.json`
- Create: `packages/validation-core/tsconfig.json`
- Create: `packages/validation-core/vitest.config.ts`
- Create: `packages/validation-core/src/diagnostic.ts`
- Create: `packages/validation-core/src/outcome.ts`
- Create: `packages/validation-core/src/internal-error.ts`
- Create: `packages/validation-core/src/index.ts`
- Create: `packages/validation-core/test/validation-core.test.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: root TypeScript and Vitest configuration
- Produces: `Diagnostic`, `ValidationOutcome<T>`, `success`, `failure`, `hasErrors`, `mergeDiagnostics`, and `internalErrorDiagnostic`

- [ ] **Step 1: Create the package manifest and failing tests**

```json
{
  "name": "@roadmap/validation-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/validation-core/test/validation-core.test.ts
import { describe, expect, it } from 'vitest';
import {
  failure,
  hasErrors,
  internalErrorDiagnostic,
  mergeDiagnostics,
  success,
} from '../src/index.js';

describe('validation outcomes', () => {
  it('preserves warnings on successful values', () => {
    const warning = {
      code: 'TEST_WARNING_001',
      severity: 'warning' as const,
      location: { file: 'fixture.yml' },
      observed: 'old',
      expected: 'new',
      reason: 'The fixture is intentionally old',
      remediation: 'Update the fixture',
      documentation: 'docs/validation.md',
    };
    expect(success(42, [warning])).toEqual({ ok: true, value: 42, diagnostics: [warning] });
  });

  it('detects error severity independently of warning count', () => {
    expect(hasErrors([{ ...internalErrorDiagnostic(new Error('boom')), severity: 'error' }])).toBe(true);
  });

  it('deduplicates identical diagnostics while preserving order', () => {
    const diagnostic = internalErrorDiagnostic(new Error('boom'));
    expect(mergeDiagnostics([diagnostic], [diagnostic])).toEqual([diagnostic]);
  });

  it('creates a failed outcome with no value', () => {
    const diagnostic = internalErrorDiagnostic(new Error('boom'));
    expect(failure([diagnostic])).toEqual({ ok: false, diagnostics: [diagnostic] });
  });
});
```

- [ ] **Step 2: Run the test and confirm the exports are missing**

```bash
pnpm --filter @roadmap/validation-core test
```

Expected: compilation failure because `src/index.ts` does not exist.

- [ ] **Step 3: Implement the shared diagnostic and outcome types**

```ts
// packages/validation-core/src/diagnostic.ts
export type DiagnosticSeverity = 'error' | 'warning' | 'notice';

export interface SourceLocation {
  file: string;
  line?: number;
  column?: number;
  pointer?: string;
}

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  location: SourceLocation;
  observed: unknown;
  expected: string;
  reason: string;
  remediation: string;
  documentation: string;
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(({ severity }) => severity === 'error');
}

export function mergeDiagnostics(
  ...groups: readonly (readonly Diagnostic[])[]
): readonly Diagnostic[] {
  const seen = new Set<string>();
  const merged: Diagnostic[] = [];
  for (const diagnostic of groups.flat()) {
    const key = JSON.stringify(diagnostic);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(diagnostic);
    }
  }
  return merged;
}
```

```ts
// packages/validation-core/src/outcome.ts
import type { Diagnostic } from './diagnostic.js';

export type ValidationOutcome<T> =
  | { ok: true; value: T; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };

export const success = <T>(
  value: T,
  diagnostics: readonly Diagnostic[] = [],
): ValidationOutcome<T> => ({ ok: true, value, diagnostics });

export const failure = <T = never>(
  diagnostics: readonly Diagnostic[],
): ValidationOutcome<T> => ({ ok: false, diagnostics });
```

```ts
// packages/validation-core/src/internal-error.ts
import type { Diagnostic } from './diagnostic.js';

export function internalErrorDiagnostic(error: unknown, file = '<validator>'): Diagnostic {
  return {
    code: 'VALIDATOR_INTERNAL_001',
    severity: 'error',
    location: { file },
    observed: error instanceof Error ? error.message : String(error),
    expected: 'Validator completes without throwing',
    reason: 'An unexpected validator exception prevents a trustworthy result',
    remediation: 'Fix the validator and add a regression fixture before rerunning validation',
    documentation: 'docs/architecture/validation.md#validator-internal-errors',
  };
}
```

- [ ] **Step 4: Export the public interface and add package configs**

```ts
// packages/validation-core/src/index.ts
export * from './diagnostic.js';
export * from './internal-error.js';
export * from './outcome.js';
```

```json
// packages/validation-core/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "test/**/*.ts", "vitest.config.ts"]
}
```

```ts
// packages/validation-core/vitest.config.ts
import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'validation-core',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
```

Add `@types/node` to the root exact dependency catalog and update `vitest.config.ts` to include `packages/*/vitest.config.ts`.

- [ ] **Step 5: Run package and root checks**

```bash
pnpm --filter @roadmap/validation-core test
pnpm --filter @roadmap/validation-core check
pnpm check
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/validation-core package.json pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts
git commit -m "feat: add structured validation outcomes"
```

### Task 2: Define canonical curriculum IDs and entity schemas

**Files:**
- Create: `packages/curriculum-schema/package.json`
- Create: `packages/curriculum-schema/tsconfig.json`
- Create: `packages/curriculum-schema/vitest.config.ts`
- Create: `packages/curriculum-schema/src/ids.ts`
- Create: `packages/curriculum-schema/src/common.ts`
- Create: `packages/curriculum-schema/src/entities.ts`
- Create: `packages/curriculum-schema/src/document.ts`
- Create: `packages/curriculum-schema/src/index.ts`
- Create: `packages/curriculum-schema/test/schema.test.ts`

**Interfaces:**
- Consumes: `@roadmap/validation-core` and Zod 4
- Produces: schemas and inferred types for `Track`, `Competency`, `Module`, `Lesson`, `Assessment`, and `Milestone`

- [ ] **Step 1: Write tests that lock ID families and entity-specific fields**

```ts
// packages/curriculum-schema/test/schema.test.ts
import { describe, expect, it } from 'vitest';
import {
  ArtifactIdSchema,
  CompetencyIdSchema,
  CurriculumEntitySchema,
  LessonSchema,
} from '../src/index.js';

describe('stable identifiers', () => {
  it.each(['js.function.closure', 'api.authz.resource-ownership'])('accepts competency ID %s', (id) => {
    expect(CompetencyIdSchema.parse(id)).toBe(id);
  });

  it.each(['lesson-js-closure-private-state', 'module-js-functions', 'ex-js-closure-counter', 'rubric-workshop-enrollment'])('accepts artifact ID %s', (id) => {
    expect(ArtifactIdSchema.parse(id)).toBe(id);
  });

  it.each(['Lesson JS', 'js', 'lesson_js'])('rejects invalid artifact ID %s', (id) => {
    expect(() => ArtifactIdSchema.parse(id)).toThrow();
  });
});

describe('lesson schema', () => {
  it('accepts a minimal published lesson', () => {
    const lesson = LessonSchema.parse({
      schemaVersion: 1,
      kind: 'lesson',
      id: 'lesson-js-closure-private-state',
      slug: 'javascript/functions/closure-private-state',
      title: 'Closure và trạng thái riêng',
      description: 'Giải thích lexical environment được giữ lại như thế nào',
      status: 'published',
      module: 'module-js-functions',
      competencies: ['js.function.closure'],
      prerequisites: ['js.function.values'],
      exercises: ['ex-js-closure-counter'],
      assessments: ['assessment-js-closure'],
      introducedIn: '0.1.0',
      lastReviewedIn: '0.1.0',
      sourceLanguage: 'vi',
      professionalArtifactLanguage: 'en',
    });
    expect(lesson.kind).toBe('lesson');
  });

  it('rejects unknown fields to prevent silent metadata drift', () => {
    const result = CurriculumEntitySchema.safeParse({
      schemaVersion: 1,
      kind: 'lesson',
      id: 'lesson-js-invalid',
      title: 'Invalid',
      status: 'draft',
      undocumentedField: true,
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the schemas are missing**

```bash
pnpm --filter @roadmap/curriculum-schema test
```

Expected: module-not-found or missing-export failure.

- [ ] **Step 3: Implement the ID and common schemas**

```ts
// packages/curriculum-schema/src/ids.ts
import { z } from 'zod';

export const CompetencyIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*)+$/);

export const ArtifactIdSchema = z
  .string()
  .regex(/^(?:track|gate|module|lesson|assessment|milestone|project|exercise|ex|lab|check|rubric|evidence|release|remediation|change-request|debugging)-[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const RouteSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:[/-][a-z0-9]+)*$/)
  .refine((value) => !value.startsWith('/') && !value.endsWith('/'));

export type CompetencyId = z.infer<typeof CompetencyIdSchema>;
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;
```

```ts
// packages/curriculum-schema/src/common.ts
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
```

- [ ] **Step 4: Implement strict discriminated entity schemas**

```ts
// packages/curriculum-schema/src/entities.ts
import { z } from 'zod';
import { ArtifactIdSchema, CompetencyIdSchema } from './ids.js';
import { CommonArtifactFields, MasteryLevelSchema } from './common.js';

export const TrackSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('track'),
    requiredCompetencies: z.array(CompetencyIdSchema),
    modules: z.array(ArtifactIdSchema),
  })
  .strict();

export const CompetencySchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.literal('competency'),
    id: CompetencyIdSchema,
    slug: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    status: z.enum(['draft', 'review', 'published', 'deprecated', 'withdrawn']),
    prerequisites: z.array(CompetencyIdSchema).default([]),
    requiredLevel: MasteryLevelSchema,
    assessments: z.array(ArtifactIdSchema).min(1),
    remediation: z.array(ArtifactIdSchema).min(1),
    introducedIn: z.string().regex(/^\d+\.\d+\.\d+$/),
    lastReviewedIn: z.string().regex(/^\d+\.\d+\.\d+$/),
  })
  .strict();

export const ModuleSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('module'),
    competencies: z.array(CompetencyIdSchema).min(1),
    lessons: z.array(ArtifactIdSchema).min(1),
    milestone: ArtifactIdSchema.optional(),
  })
  .strict();

export const LessonSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('lesson'),
    module: ArtifactIdSchema,
    competencies: z.array(CompetencyIdSchema).min(1),
    exercises: z.array(ArtifactIdSchema).default([]),
    assessments: z.array(ArtifactIdSchema).default([]),
    sourceLanguage: z.literal('vi'),
    professionalArtifactLanguage: z.literal('en'),
  })
  .strict();

export const AssessmentSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('assessment'),
    assessmentType: z.enum([
      'knowledge-check',
      'focused-exercise',
      'mechanism-lab',
      'debugging-task',
      'change-request',
      'milestone-project',
    ]),
    competencies: z.array(CompetencyIdSchema).min(1),
    artifact: ArtifactIdSchema.optional(),
  })
  .strict();

export const MilestoneSchema = z
  .object({
    ...CommonArtifactFields,
    kind: z.literal('milestone'),
    competencies: z.array(CompetencyIdSchema).min(1),
    project: ArtifactIdSchema,
    rubric: ArtifactIdSchema,
    evidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const CurriculumEntitySchema = z.discriminatedUnion('kind', [
  TrackSchema,
  CompetencySchema,
  ModuleSchema,
  LessonSchema,
  AssessmentSchema,
  MilestoneSchema,
]);

export type CurriculumEntity = z.infer<typeof CurriculumEntitySchema>;
```

- [ ] **Step 5: Define loaded-document types and exports**

```ts
// packages/curriculum-schema/src/document.ts
import type { CurriculumEntity } from './entities.js';

export interface CurriculumDocument<T extends CurriculumEntity = CurriculumEntity> {
  filePath: string;
  body: string;
  data: T;
}

export interface CurriculumCorpus {
  documents: readonly CurriculumDocument[];
}
```

Export all public types from `src/index.ts`, add standard package configs, and depend on `@roadmap/validation-core` with `workspace:*` only if diagnostics are used directly.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @roadmap/curriculum-schema test
pnpm --filter @roadmap/curriculum-schema check
pnpm check
git add packages/curriculum-schema package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: define curriculum entity schemas"
```

### Owner-approved preflight amendment — 2026-07-28

The following rulings govern Tasks 3, 5, 7, and 8. They preserve the public package and diagnostic contracts while making repository ownership and graph semantics explicit:

- `contains` is a normalized structural-traversal edge, not a declaration-direction or generic dependency edge. Declared references remain separate and carry their declaring document, target, relation, source file, and exact frontmatter pointer.
- Structural containment is exactly track → module, module → competency, module → lesson, and module → milestone; no other `contains` shape may be normalized. Reverse metadata such as `lesson.module` and `lesson.competencies` is still validated from the declaring document.
- Only a `published` track is an active completeness root. `draft`, `review`, `deprecated`, and `withdrawn` tracks do not establish completeness roots.
- Task 3 owns `scripts/generate-json-schema.ts` in the root TypeScript project. Task 8 updates the existing root script contract while preserving `test:bootstrap` and `test:wp-00-01-gate`.

### Task 3: Generate and drift-check JSON Schema

**Files:**
- Create: `packages/curriculum-schema/src/json-schema.ts`
- Create: `packages/curriculum-schema/generated/curriculum.schema.json`
- Create: `packages/curriculum-schema/test/json-schema.test.ts`
- Create: `scripts/generate-json-schema.ts`
- Modify: `packages/curriculum-schema/package.json`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `scripts/config-contract.test.mjs`
- Modify: `.prettierignore`

**Interfaces:**
- Consumes: `CurriculumEntitySchema` and the existing strict root TypeScript project
- Produces: `generateCurriculumJsonSchema(): object`, `pnpm schema:generate`, and a generator owned by `tsconfig.json`

- [ ] **Step 1: Write failing drift and TypeScript-ownership tests**

```ts
// packages/curriculum-schema/test/json-schema.test.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateCurriculumJsonSchema } from '../src/json-schema.js';

describe('generated JSON Schema', () => {
  it('matches the canonical Zod schema exactly', async () => {
    const committed = JSON.parse(
      await readFile(new URL('../generated/curriculum.schema.json', import.meta.url), 'utf8'),
    );
    expect(committed).toEqual(generateCurriculumJsonSchema());
  });
});
```

Surgically extend the existing root compiler-contract test; preserve its `extends` assertion and existing `vitest.config.ts` ownership:

```js
// scripts/config-contract.test.mjs
test('root compiler entry point extends the base contract', async () => {
  const config = await readJson('tsconfig.json');
  assert.equal(config.extends, './tsconfig.base.json');
  assert.deepEqual(config.include, ['vitest.config.ts', 'scripts/generate-json-schema.ts']);
});
```

- [ ] **Step 2: Run both focused RED commands and capture them separately**

```bash
node --test scripts/config-contract.test.mjs
```

Expected: the root compiler-contract assertion fails because `scripts/generate-json-schema.ts` is not yet owned by `tsconfig.json`. Record the exact command, working directory, exit status, observed count, stdout, stderr, channel-integrity label, and why this proves the ownership gap.

```bash
pnpm --filter @roadmap/curriculum-schema test
```

Expected: missing module or missing generated file. Preserve this as a separate historical RED capture with the same evidence fields.

- [ ] **Step 3: Implement Zod 4 JSON Schema conversion**

```ts
// packages/curriculum-schema/src/json-schema.ts
import { z } from 'zod';
import { CurriculumEntitySchema } from './entities.js';

export function generateCurriculumJsonSchema(): object {
  return z.toJSONSchema(CurriculumEntitySchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
}
```

- [ ] **Step 4: Add the deterministic generator and extend real TypeScript ownership**

Keep `scripts/generate-json-schema.ts`. Follow the repository's strict NodeNext ESM convention by using a `.js` import specifier; do not add `allowImportingTsExtensions`, a broad compiler waiver, an ESLint ignore, or project-service `allowDefaultProject`:

```ts
// scripts/generate-json-schema.ts
import { writeFile } from 'node:fs/promises';
import { generateCurriculumJsonSchema } from '../packages/curriculum-schema/src/json-schema.js';

const output = new URL(
  '../packages/curriculum-schema/generated/curriculum.schema.json',
  import.meta.url,
);
const schema = generateCurriculumJsonSchema();
await writeFile(output, `${JSON.stringify(schema, null, 2)}\n`);
```

Surgically extend the existing root project. Preserve every existing entry and compiler relationship:

```json
// tsconfig.json
{
  "extends": "./tsconfig.base.json",
  "include": ["vitest.config.ts", "scripts/generate-json-schema.ts"]
}
```

Execute the generator through the already pinned `tsx` dependency. Merge these mappings into the current root `scripts` object without removing any verified command:

```json
{
  "scripts": {
    "schema:generate": "tsx scripts/generate-json-schema.ts",
    "schema:check": "pnpm schema:generate && git diff --exit-code -- packages/curriculum-schema/generated/curriculum.schema.json"
  }
}
```

The committed schema is generated state whose byte layout is owned by `JSON.stringify(schema, null, 2)`, not by Prettier. Add `/packages/curriculum-schema/generated/` to `.prettierignore` and extend the existing Prettier-ownership contract test's case list with `['packages/curriculum-schema/generated/curriculum.schema.json', true]` so the generated-state boundary stays asserted; do not reformat the generator output and do not weaken any other ignore entry or assertion.

- [ ] **Step 5: Run fresh GREEN verification and commit the Task 3 boundary**

Run each command separately and record its real exit status and output:

```bash
node --test scripts/config-contract.test.mjs
pnpm format:check
pnpm lint
pnpm typecheck
pnpm schema:generate
pnpm --filter @roadmap/curriculum-schema test
pnpm schema:check
pnpm check
git diff --check
```

Required: every command exits `0`; the focused config-contract test proves both the original root ownership and the generator ownership. Inspect the generated JSON Schema instead of trusting only the generator summary.

```bash
git add scripts/generate-json-schema.ts packages/curriculum-schema/src/json-schema.ts packages/curriculum-schema/generated packages/curriculum-schema/test/json-schema.test.ts packages/curriculum-schema/package.json package.json pnpm-lock.yaml tsconfig.json scripts/config-contract.test.mjs .prettierignore
git commit -m "build: generate curriculum json schema"
```

### Task 4: Implement the Markdown curriculum loader

**Files:**
- Create: `packages/curriculum-loader/package.json`
- Create: `packages/curriculum-loader/tsconfig.json`
- Create: `packages/curriculum-loader/vitest.config.ts`
- Create: `packages/curriculum-loader/src/frontmatter.ts`
- Create: `packages/curriculum-loader/src/load-file.ts`
- Create: `packages/curriculum-loader/src/load-curriculum.ts`
- Create: `packages/curriculum-loader/src/index.ts`
- Create: `packages/curriculum-loader/test/loader.test.ts`
- Create: `fixtures/curriculum/valid/minimal/**/*.md`
- Create: `fixtures/curriculum/invalid/schema-error/**/*.md`

**Interfaces:**
- Consumes: `CurriculumEntitySchema`
- Produces: `loadCurriculum(root: string): Promise<ValidationOutcome<CurriculumCorpus>>`

- [ ] **Step 1: Add valid and invalid Markdown fixtures**

```markdown
---
schemaVersion: 1
kind: competency
id: js.function.values
slug: competencies/js/function-values
title: Giá trị hàm
description: Xem hàm như giá trị có thể truyền và trả về
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

Nội dung fixture tối thiểu.
```

The invalid fixture includes `status: public`, which is not an allowed publication status.

- [ ] **Step 2: Write failing loader tests**

```ts
// packages/curriculum-loader/test/loader.test.ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '../src/index.js';

const fixtures = path.resolve(import.meta.dirname, '../../../fixtures/curriculum');

describe('loadCurriculum', () => {
  it('loads validated Markdown documents and preserves body and file path', async () => {
    const outcome = await loadCurriculum(path.join(fixtures, 'valid/minimal'));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.documents.length).toBeGreaterThan(0);
    expect(outcome.value.documents[0]?.body).toContain('fixture');
    expect(outcome.value.documents[0]?.filePath).toMatch(/\.md$/);
  });

  it('returns CURRICULUM_SCHEMA_001 for invalid frontmatter', async () => {
    const outcome = await loadCurriculum(path.join(fixtures, 'invalid/schema-error'));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map(({ code }) => code)).toContain('CURRICULUM_SCHEMA_001');
  });
});
```

- [ ] **Step 3: Parse YAML frontmatter without website dependencies**

```ts
// packages/curriculum-loader/src/frontmatter.ts
import YAML from 'yaml';

export interface ParsedFrontmatter {
  data: unknown;
  body: string;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  if (!source.startsWith('---\n')) throw new Error('Missing opening frontmatter delimiter');
  const end = source.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('Missing closing frontmatter delimiter');
  const data = YAML.parse(source.slice(4, end));
  const body = source.slice(end + 5);
  return { data, body };
}
```

- [ ] **Step 4: Implement file and directory loading with structured diagnostics**

```ts
// packages/curriculum-loader/src/load-file.ts
import { readFile } from 'node:fs/promises';
import { CurriculumEntitySchema, type CurriculumDocument } from '@roadmap/curriculum-schema';
import { failure, success, type Diagnostic, type ValidationOutcome } from '@roadmap/validation-core';
import { parseFrontmatter } from './frontmatter.js';

export async function loadCurriculumFile(
  filePath: string,
): Promise<ValidationOutcome<CurriculumDocument>> {
  try {
    const source = await readFile(filePath, 'utf8');
    const parsed = parseFrontmatter(source);
    const result = CurriculumEntitySchema.safeParse(parsed.data);
    if (!result.success) {
      const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
        code: 'CURRICULUM_SCHEMA_001',
        severity: 'error',
        location: { file: filePath, pointer: issue.path.join('.') },
        observed: issue.input,
        expected: issue.message,
        reason: 'Curriculum frontmatter does not satisfy the canonical schema',
        remediation: 'Correct the named field and rerun content validation',
        documentation: 'docs/authoring/curriculum-metadata.md',
      }));
      return failure(diagnostics);
    }
    return success({ filePath, body: parsed.body, data: result.data });
  } catch (error) {
    return failure([{
      code: 'CURRICULUM_PARSE_001',
      severity: 'error',
      location: { file: filePath },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'UTF-8 Markdown with YAML frontmatter',
      reason: 'The curriculum source could not be parsed',
      remediation: 'Repair the Markdown or frontmatter delimiters and rerun validation',
      documentation: 'docs/authoring/curriculum-metadata.md',
    }]);
  }
}
```

Implement `loadCurriculum` using `fs.readdir({ recursive: true, withFileTypes: true })`.
Curriculum discovery selects `.md` and `.mdx` files except files whose name is exactly
`AGENTS.md`. Apply that exact-name exclusion before artifact parsing at every directory depth.
Do not broaden it to hidden files, Markdown metadata generally, documentation files, or parse
failures: every other `.md` and `.mdx` candidate remains fail-closed. Normalize path separators,
sort candidate paths with the package's codepoint comparator for deterministic results, collect all
diagnostics, and return a corpus only when no error exists. The same root must always produce the
same artifact set, and excluded governance files must never enter `loadCurriculumFile`.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @roadmap/curriculum-loader test
pnpm --filter @roadmap/curriculum-loader check
pnpm check
git add packages/curriculum-loader fixtures/curriculum package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: load validated curriculum markdown"
```

### Task 5: Build the stable-ID registry and resolve graph edges

**Files:**
- Create: `packages/curriculum-graph/package.json`
- Create: `packages/curriculum-graph/tsconfig.json`
- Create: `packages/curriculum-graph/vitest.config.ts`
- Create: `packages/curriculum-graph/src/types.ts`
- Create: `packages/curriculum-graph/src/registry.ts`
- Create: `packages/curriculum-graph/src/references.ts`
- Create: `packages/curriculum-graph/src/edges.ts`
- Create: `packages/curriculum-graph/src/index.ts`
- Create: `packages/curriculum-graph/test/registry.test.ts`
- Create: `packages/curriculum-graph/test/references.test.ts`
- Create: `packages/curriculum-graph/test/support/graph-fixture.ts`
- Modify: `fixtures/curriculum/valid/minimal/**/*.md`
- Create: `fixtures/curriculum/invalid/duplicate-id/**/*.md`
- Create: `fixtures/curriculum/invalid/missing-reference/**/*.md`
- Create: `fixtures/curriculum/invalid/missing-module-competency/**/*.md`
- Create: `fixtures/curriculum/invalid/missing-module-milestone/**/*.md`
- Create: `fixtures/curriculum/invalid/wrong-kind-module-lesson/**/*.md`

**Interfaces:**
- Consumes: `CurriculumCorpus`
- Produces: `buildCurriculumGraph(corpus): ValidationOutcome<CurriculumGraph>` with deterministic `declaredReferences` and deduplicated normalized structural edges

- [ ] **Step 1: Write RED tests for registry, declarations, containment, and exact diagnostics**

Keep the duplicate-ID coverage and add focused declared-reference tests. The valid minimal fixture must contain these exact structural IDs:

```text
track-js-core
└── module-js-functions
    ├── js.function.values
    ├── lesson-js-function-values
    └── milestone-js-foundations
```

Keep the existing duplicate-ID and generic missing-reference tests in `registry.test.ts`, refactored to use the shared helper:

```ts
// packages/curriculum-graph/test/registry.test.ts
import { describe, expect, it } from 'vitest';
import { resolveReferences } from '../src/references.js';
import { graphFixture } from './support/graph-fixture.js';

describe('stable-ID registry', () => {
  it('rejects duplicate IDs with both file locations', async () => {
    const outcome = await graphFixture('invalid/duplicate-id');
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CURRICULUM_ID_001' })]),
    );
  });

  it('rejects unresolved references', async () => {
    const outcome = await graphFixture('invalid/missing-reference');
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CURRICULUM_REFERENCE_001' })]),
    );
  });
});
```

New declared-reference tests:

```ts
// packages/curriculum-graph/test/references.test.ts
import { describe, expect, it } from 'vitest';
import { graphFixture } from './support/graph-fixture.js';

describe('declared references and normalized containment', () => {
  it('normalizes track, module, competency, lesson, and milestone containment', async () => {
    const outcome = await graphFixture('valid/minimal');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.value.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: 'track-js-core', to: 'module-js-functions', type: 'contains' }),
        expect.objectContaining({ from: 'module-js-functions', to: 'js.function.values', type: 'contains' }),
        expect.objectContaining({ from: 'module-js-functions', to: 'lesson-js-function-values', type: 'contains' }),
        expect.objectContaining({ from: 'module-js-functions', to: 'milestone-js-foundations', type: 'contains' }),
      ]),
    );
  });

  it.each([
    ['invalid/missing-module-competency', 'competencies.0'],
    ['invalid/missing-module-milestone', 'milestone'],
  ])('rejects %s at the declaring pointer', async (fixture, pointer) => {
    const outcome = await graphFixture(fixture);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CURRICULUM_REFERENCE_001',
          location: expect.objectContaining({ pointer }),
        }),
      ]),
    );
  });

  it('rejects an existing wrong-kind module lesson at the declaring pointer', async () => {
    const outcome = await graphFixture('invalid/wrong-kind-module-lesson');
    expect(outcome.ok).toBe(false);
    const fileMatcher: unknown = expect.stringMatching(/module\.md$/);
    const locationMatcher: unknown = expect.objectContaining({
      file: fileMatcher,
      pointer: 'lessons.0',
    });
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({
        code: 'CURRICULUM_REFERENCE_002',
        location: locationMatcher,
        observed: {
          targetId: 'assessment-wrong-kind-module-lesson',
          actualKind: 'assessment',
        },
        expected:
          'A curriculum document with kind "lesson" for module.lessons',
      }),
    ]);
  });

  it.each([
    ['track.requiredCompetencies', 'module-js-functions', 'module', 'competency'],
    ['track.modules', 'lesson-js-function-values', 'lesson', 'module'],
    ['module.competencies', 'lesson-js-function-values', 'lesson', 'competency'],
    ['module.lessons', 'assessment-js-function-values', 'assessment', 'lesson'],
    ['module.milestone', 'module-js-functions', 'module', 'milestone'],
    ['lesson.module', 'track-js-core', 'track', 'module'],
    ['lesson.competencies', 'assessment-js-function-values', 'assessment', 'competency'],
    ['lesson.assessments', 'lesson-js-function-values', 'lesson', 'assessment'],
    ['assessment.competencies', 'milestone-js-foundations', 'milestone', 'competency'],
    ['milestone.competencies', 'lesson-js-function-values', 'lesson', 'competency'],
  ] as const)(
    'rejects %s target %s whose existing kind is %s instead of %s',
    async (relation, targetId, actualKind, expectedKind) => {
      const valid = await graphFixture('valid/minimal');
      expect(valid.ok).toBe(true);
      if (!valid.ok) return;

      expect(
        resolveReferences(valid.value.nodes, [
          {
            declaringId: 'module-js-functions',
            targetId,
            relation,
            sourceFile: 'matrix.md',
            pointer: 'target.0',
          },
        ]),
      ).toEqual([
        expect.objectContaining({
          code: 'CURRICULUM_REFERENCE_002',
          location: { file: 'matrix.md', pointer: 'target.0' },
          observed: { targetId, actualKind },
          expected: `A curriculum document with kind "${expectedKind}" for ${relation}`,
        }),
      ]);
    },
  );

  it.each([
    [
      'invalid/missing-assessment',
      'test.missing-assessment',
      'lesson-assessment-wrong-kind',
      'assesses',
    ],
    [
      'invalid/missing-remediation',
      'test.missing-remediation',
      'assessment-remediation-wrong-kind',
      'remediates',
    ],
  ] as const)(
    'defers the competency evidence relation in %s to Task 7 completeness',
    async (fixture, competencyId, targetId, edgeType) => {
      const outcome = await graphFixture(fixture);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: competencyId,
            to: targetId,
            type: edgeType,
          }),
        ]),
      );
    },
  );

  it('deduplicates reciprocal structural declarations without losing declaration locations', async () => {
    const outcome = await graphFixture('valid/minimal');
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const moduleLessonEdges = outcome.value.edges.filter(
      ({ from, to, type }) =>
        from === 'module-js-functions' &&
        to === 'lesson-js-function-values' &&
        type === 'contains',
    );
    expect(moduleLessonEdges).toHaveLength(1);
    expect(outcome.value.declaredReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          declaringId: 'module-js-functions',
          targetId: 'lesson-js-function-values',
          relation: 'module.lessons',
        }),
        expect.objectContaining({
          declaringId: 'lesson-js-function-values',
          targetId: 'module-js-functions',
          relation: 'lesson.module',
        }),
      ]),
    );
  });
});
```

Create `fixtures/curriculum/invalid/wrong-kind-module-lesson/` with four
schema-valid documents and these exact IDs and references:

```text
module.md
  kind: module
  id: module-wrong-kind-lesson
  competencies: [test.wrong-kind.module-lesson]
  lessons: [assessment-wrong-kind-module-lesson] # the sole wrong-kind relation

competency.md
  kind: competency
  id: test.wrong-kind.module-lesson
  assessments: [assessment-wrong-kind-module-lesson]
  remediation: [lesson-wrong-kind-support]

lesson.md
  kind: lesson
  id: lesson-wrong-kind-support
  module: module-wrong-kind-lesson
  competencies: [test.wrong-kind.module-lesson]
  exercises: []
  assessments: []
  sourceLanguage: vi
  professionalArtifactLanguage: en

assessment.md
  kind: assessment
  id: assessment-wrong-kind-module-lesson
  assessmentType: knowledge-check
  competencies: [test.wrong-kind.module-lesson]
```

Every document also uses `schemaVersion: 1`, `status: draft`,
`prerequisites: []`, `introducedIn: 0.1.0`, `lastReviewedIn: 0.1.0`, and
schema-valid unique `slug`, `title`, and `description` values. Do not add a
track or milestone. All declarations except `module.lessons.0` must resolve
to the required kind, so the fixture isolates one
`CURRICULUM_REFERENCE_002`.

Create `packages/curriculum-graph/test/support/graph-fixture.ts`. It may load only the named fixture and must not mutate authoritative repository files.

- [ ] **Step 2: Run the focused package RED and capture original evidence**

```bash
pnpm --filter @roadmap/curriculum-graph test
```

Expected: module-not-found or missing-export failures for the graph package. Record the exact command, working directory, exit status, observed test count, stdout, stderr, channel-integrity label, and why the failure proves the missing behavior.

For the 2026-07-29 whole-branch wrong-kind correction, add the schema-valid
`invalid/wrong-kind-module-lesson` fixture and the tests above before changing
`references.ts`, then run:

```bash
pnpm --filter @roadmap/curriculum-graph exec vitest run --config vitest.config.ts test/references.test.ts
```

Expected correction RED: exit `1`; the wrong-kind fixture and all ten matrix
rows fail because the current implementation accepts any existing target ID,
while both Task 7 competency-evidence deferral cases pass. Record the exact
command, working directory, exit status, test count, stdout, stderr, and
`PRESERVED_SEPARATE_OS_PIPES` channel-integrity label. This correction was
discovered by the final whole-branch review, not by the original Task 5
preflight.

- [ ] **Step 3: Define graph nodes, declaration facts, and the unchanged public edge family**

Do not add a second dependency-edge type. `contains` represents normalized structural traversal only.

```ts
// packages/curriculum-graph/src/types.ts
import type { CurriculumDocument } from '@roadmap/curriculum-schema';

export type EdgeType =
  | 'prerequisite'
  | 'contains'
  | 'assesses'
  | 'remediates'
  | 'milestone-project';

export type DeclaredReferenceRelation =
  | 'prerequisites'
  | 'track.requiredCompetencies'
  | 'track.modules'
  | 'module.competencies'
  | 'module.lessons'
  | 'module.milestone'
  | 'lesson.module'
  | 'lesson.competencies'
  | 'lesson.exercises'
  | 'lesson.assessments'
  | 'competency.assessments'
  | 'competency.remediation'
  | 'assessment.competencies'
  | 'assessment.artifact'
  | 'milestone.competencies'
  | 'milestone.project'
  | 'milestone.rubric';

export interface DeclaredReference {
  declaringId: string;
  targetId: string;
  relation: DeclaredReferenceRelation;
  sourceFile: string;
  pointer: string;
}

export interface CurriculumEdge {
  from: string;
  to: string;
  type: EdgeType;
  sourceFile: string;
}

export interface CurriculumGraph {
  nodes: ReadonlyMap<string, CurriculumDocument>;
  declaredReferences: readonly DeclaredReference[];
  edges: readonly CurriculumEdge[];
}
```

`declaredReferences` is deterministic: sort by `sourceFile`, then `pointer`, then `declaringId`, `relation`, and `targetId`. A pointer names the actual frontmatter field using dot-separated paths such as `competencies.0`, `milestone`, or `module`.

- [ ] **Step 4: Enumerate declared references before creating normalized edges**

`createRegistry` inserts documents in deterministic file order. On a duplicate, it emits one `CURRICULUM_ID_001` diagnostic naming both file paths and returns no graph.

`enumerateDeclaredReferences` must inspect every reference-bearing field in deterministic document and array order. Declaration ownership always remains declaring document → referenced target, even when structural normalization later reverses the edge.

Use this explicit WP-02–03 reference-field matrix:

| Declaring field | Target contract in WP-02–03 | Local resolution and diagnostic ownership | Normalized graph result |
|---|---|---|---|
| `entity.prerequisites[]` | Competency or current-union artifact | Required; any registered current-union kind satisfies Task 5 | declaring entity → target, `prerequisite` |
| `track.requiredCompetencies[]` | Competency | Required; enforce `competency` kind with `CURRICULUM_REFERENCE_002` | Declaration only; module containment proves completeness |
| `track.modules[]` | Module | Required; enforce `module` kind with `CURRICULUM_REFERENCE_002` | track → module, `contains` |
| `module.competencies[]` | Competency | Required; enforce `competency` kind with `CURRICULUM_REFERENCE_002` | module → competency, `contains` |
| `module.lessons[]` | Lesson | Required; enforce `lesson` kind with `CURRICULUM_REFERENCE_002` | module → lesson, `contains` |
| `module.milestone` | Milestone | Required when present; enforce `milestone` kind with `CURRICULUM_REFERENCE_002` | module → milestone, `contains` |
| `lesson.module` | Module | Required; enforce `module` kind with `CURRICULUM_REFERENCE_002` | referenced module → declaring lesson, `contains` |
| `lesson.competencies[]` | Competency | Required; enforce `competency` kind with `CURRICULUM_REFERENCE_002` | Declaration only; module containment already links competency and lesson |
| `lesson.exercises[]` | Exercise/lab family owned by later packages | Not local in WP-02–03 | Declaration retained; no local edge or missing-target diagnostic |
| `lesson.assessments[]` | Assessment | Required; enforce `assessment` kind with `CURRICULUM_REFERENCE_002` | referenced assessment relation retained; no additional structural edge |
| `competency.assessments[]` | Assessment | Required ID resolution; wrong-kind ownership remains `CURRICULUM_COMPLETENESS_002` in Task 7, never `CURRICULUM_REFERENCE_002` | competency → assessment, `assesses` |
| `competency.remediation[]` | Lesson in the current kernel | Required ID resolution; wrong-kind ownership remains `CURRICULUM_COMPLETENESS_003` in Task 7, never `CURRICULUM_REFERENCE_002` | competency → lesson, `remediates` |
| `assessment.competencies[]` | Competency | Required; enforce `competency` kind with `CURRICULUM_REFERENCE_002` | referenced competency → declaring assessment, `assesses` |
| `assessment.artifact` | Exercise/lab/project family owned by later packages | Not local in WP-02–03 | Declaration retained; no local edge or missing-target diagnostic |
| `milestone.competencies[]` | Competency | Required; enforce `competency` kind with `CURRICULUM_REFERENCE_002` | Declaration only |
| `milestone.project` | Project family owned by a later package | Not local in WP-02–03 | Declaration retained; no local edge or missing-target diagnostic |
| `milestone.rubric` | Rubric family owned by a later package | Not local in WP-02–03 | Declaration retained; no local edge or missing-target diagnostic |

`milestone.evidence[]` contains evidence requirements, not stable entity IDs, and is not a graph reference in WP-02–03. A later package must amend this matrix before any opaque family becomes locally resolvable. Do not silently infer a local target from an artifact prefix.

For every required local target absent from the registry, emit
`CURRICULUM_REFERENCE_001` at the declaring document's `sourceFile` and exact
dot-separated frontmatter `pointer`. `CURRICULUM_REFERENCE_001` means only
that the target ID does not exist.

When an ordinary required local target ID exists but its registered document
kind does not match the matrix, emit `CURRICULUM_REFERENCE_002` at the same
declaring location before graph normalization. Its exact payload is:

```ts
{
  code: 'CURRICULUM_REFERENCE_002',
  severity: 'error',
  location: { file: reference.sourceFile, pointer: reference.pointer },
  observed: { targetId: reference.targetId, actualKind: target.data.kind },
  expected: `A curriculum document with kind "${expectedKind}" for ${reference.relation}`,
  reason:
    `The ${reference.relation} reference to "${reference.targetId}" resolves to kind ` +
    `"${target.data.kind}" instead of "${expectedKind}"`,
  remediation:
    `Reference a registered "${expectedKind}" document from ${reference.relation}`,
  documentation: 'docs/authoring/curriculum-metadata.md',
}
```

Use this exact ordinary-relation mapping:

```ts
const EXPECTED_TARGET_KINDS: Partial<
  Record<DeclaredReferenceRelation, CurriculumDocument['data']['kind']>
> = {
  'track.requiredCompetencies': 'competency',
  'track.modules': 'module',
  'module.competencies': 'competency',
  'module.lessons': 'lesson',
  'module.milestone': 'milestone',
  'lesson.module': 'module',
  'lesson.competencies': 'competency',
  'lesson.assessments': 'assessment',
  'assessment.competencies': 'competency',
  'milestone.competencies': 'competency',
};
```

Do not add `competency.assessments` or `competency.remediation` to that mapping.
Task 5 still emits `CURRICULUM_REFERENCE_001` if either target ID is absent,
but an existing wrong-kind target remains graph-buildable and normalizes to
`assesses`/`remediates` so Task 7 emits its authoritative
`CURRICULUM_COMPLETENESS_002`/`CURRICULUM_COMPLETENESS_003` diagnostic. Do not
reuse `CURRICULUM_REFERENCE_001` for wrong-kind targets. Use declaration facts,
not `CurriculumEdge.from`, for both reference diagnostics.

After reference validation succeeds, normalize structural edges. Deduplicate by `(type, from, to)` so reciprocal `module.lessons` and `lesson.module` declarations produce one module → lesson edge. Choose the structural edge's `sourceFile` from the first declaration in deterministic declaration order, but retain every declaration in `declaredReferences` for later diagnostics.

- [ ] **Step 5: Run focused GREEN verification and commit**

Run each command separately:

```bash
pnpm --filter @roadmap/curriculum-graph exec vitest run --config vitest.config.ts test/references.test.ts
pnpm --filter @roadmap/curriculum-graph test
pnpm --filter @roadmap/curriculum-graph check
pnpm check
pnpm test
pnpm content:validate:curriculum
pnpm verify:wp-02-03
pnpm verify
git diff --check
```

Required acceptance evidence:

- Track → module → competency and track → module → milestone traversal exists in the valid fixture.
- Missing `module.competencies` and `module.milestone` targets fail with `CURRICULUM_REFERENCE_001` at the declaring file and pointer.
- The schema-valid `wrong-kind-module-lesson` fixture fails with exactly `CURRICULUM_REFERENCE_002` at the module's `lessons.0` declaration, and no wrong-kind edge is normalized.
- Every ordinary kind-constrained local relation in `EXPECTED_TARGET_KINDS` rejects an existing target of the wrong kind with `CURRICULUM_REFERENCE_002`.
- `competency.assessments` and `competency.remediation` existing wrong-kind targets remain graph-buildable and normalize to `assesses`/`remediates`; Task 7 continues emitting `CURRICULUM_COMPLETENESS_002`/`CURRICULUM_COMPLETENESS_003`.
- Reciprocal declarations produce one normalized structural edge while retaining both declaration locations.
- No opaque later-package target is silently treated as a current registry node.

```bash
git add packages/curriculum-graph fixtures/curriculum/valid/minimal fixtures/curriculum/invalid/duplicate-id fixtures/curriculum/invalid/missing-reference fixtures/curriculum/invalid/missing-module-competency fixtures/curriculum/invalid/missing-module-milestone fixtures/curriculum/invalid/wrong-kind-module-lesson package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: resolve curriculum graph references"
```

### Task 6: Detect complete prerequisite cycles

**Cycle-completeness contract:** every cyclic prerequisite graph must produce at least one `CURRICULUM_GRAPH_003` error (fail closed), and each reported cycle is a deterministic, canonicalized complete witness path (closed, rotation-normalized, deduplicated). Enumerating every simple cycle in a strongly connected component is not required; the required fixture shapes (self, two-node, multi-node) must each report their exact canonical path.

**Responsibility split:** `findPrerequisiteCycles` is the single pure cycle-discovery algorithm. `cycleDiagnostics` converts those paths into deterministic diagnostics and remains the collector Task 7 composes with publication/completeness diagnostics. `validatePrerequisiteCycles` is a fail-closed `ValidationOutcome` wrapper around `cycleDiagnostics`; it must not implement a second traversal. Task 7 must continue calling `cycleDiagnostics` directly rather than unwrapping or merging a nested outcome.

**Files:**
- Create: `packages/curriculum-graph/src/cycles.ts`
- Create: `packages/curriculum-graph/test/cycles.test.ts`
- Create: `fixtures/curriculum/invalid/self-cycle/**/*.md`
- Create: `fixtures/curriculum/invalid/two-node-cycle/**/*.md`
- Create: `fixtures/curriculum/invalid/multi-node-cycle/**/*.md`
- Modify: `packages/curriculum-graph/src/index.ts`

**Interfaces:**
- Consumes: a reference-resolved `CurriculumGraph`
- Produces: `findPrerequisiteCycles(graph): readonly (readonly string[])[]`
- Produces: `cycleDiagnostics(graph): readonly Diagnostic[]`
- Produces: `validatePrerequisiteCycles(graph): ValidationOutcome<CurriculumGraph>`

- [ ] **Step 1: Write low-level RED tests for discovery, diagnostics, and the fail-closed wrapper**

Pure in-memory algorithm tests intentionally bypass schema loading and may keep synthetic `a`/`b`/`c` IDs. Cover self, two-node, multi-node, acyclic, rotation-normalization/deduplication, deterministic output, diagnostic conversion, wrapper success/failure, and internal-error conversion. Use an ordinary throwing input boundary for the exception case; do not add test-only production behavior.

```ts
// packages/curriculum-graph/test/cycles.test.ts
import { describe, expect, it } from 'vitest';
import {
  cycleDiagnostics,
  findPrerequisiteCycles,
  validatePrerequisiteCycles,
} from '../src/cycles.js';
import type { CurriculumGraph } from '../src/types.js';

function graph(edges: Array<[string, string]>): CurriculumGraph {
  const ids = new Set(edges.flat());
  return {
    nodes: new Map(
      [...ids].map((id) => [id, { filePath: `${id}.md`, body: '', data: { id } } as never]),
    ),
    declaredReferences: [],
    edges: edges.map(([from, to]) => ({
      from,
      to,
      type: 'prerequisite',
      sourceFile: `${from}.md`,
    })),
  };
}

describe('findPrerequisiteCycles', () => {
  it('returns a self-cycle as a closed path', () => {
    expect(findPrerequisiteCycles(graph([['a', 'a']]))).toEqual([['a', 'a']]);
  });

  it('returns a two-node cycle as a closed path', () => {
    expect(findPrerequisiteCycles(graph([['a', 'b'], ['b', 'a']]))).toEqual([
      ['a', 'b', 'a'],
    ]);
  });

  it('returns a complete multi-node path', () => {
    expect(findPrerequisiteCycles(graph([['a', 'b'], ['b', 'c'], ['c', 'a']]))).toEqual([
      ['a', 'b', 'c', 'a'],
    ]);
  });

  it('rotation-normalizes and deduplicates a cycle reached from another node', () => {
    expect(
      findPrerequisiteCycles(
        graph([
          ['0', 'b'],
          ['b', 'c'],
          ['c', 'a'],
          ['c', 'a'],
          ['a', 'b'],
        ]),
      ),
    ).toEqual([['a', 'b', 'c', 'a']]);
  });

  it('returns no cycles for an acyclic graph', () => {
    expect(findPrerequisiteCycles(graph([['a', 'b'], ['b', 'c']]))).toEqual([]);
  });
});

describe('cycle diagnostics and validation outcome', () => {
  it('converts a cycle into CURRICULUM_GRAPH_003 with the closed path', () => {
    expect(cycleDiagnostics(graph([['a', 'a']]))).toEqual([
      expect.objectContaining({ code: 'CURRICULUM_GRAPH_003', observed: ['a', 'a'] }),
    ]);
  });

  it('returns success with the original acyclic graph', () => {
    const input = graph([['a', 'b']]);
    const outcome = validatePrerequisiteCycles(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toBe(input);
  });

  it('returns failure for a cyclic graph', () => {
    const outcome = validatePrerequisiteCycles(graph([['a', 'a']]));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ code: 'CURRICULUM_GRAPH_003', observed: ['a', 'a'] }),
    ]);
  });

  it('converts unexpected traversal exceptions to VALIDATOR_INTERNAL_001', () => {
    const throwingGraph = {
      nodes: new Map(),
      declaredReferences: [],
      get edges(): CurriculumGraph['edges'] {
        throw new Error('unexpected edge access');
      },
    } as CurriculumGraph;
    const outcome = validatePrerequisiteCycles(throwingGraph);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ code: 'VALIDATOR_INTERNAL_001' }),
    ]);
  });
});
```

- [ ] **Step 2: Run the focused low-level RED and capture original evidence**

```bash
pnpm --filter @roadmap/curriculum-graph test -- cycles.test.ts
```

Expected: `cycles.js` is absent or the three-function contract is not satisfied. Record the exact command, working directory, exit status, observed test count, relevant stdout/stderr, channel-integrity label, and why the failure proves `validatePrerequisiteCycles`/the declared outcome behavior is missing. Do not fabricate a pre-implementation RED.

- [ ] **Step 3: Implement one deterministic traversal, diagnostic conversion, and fail-closed wrapper**

Use plain codepoint comparison, never `localeCompare`, for canonical rotation and output ordering. The separator in a path sort key must appear in source as the text escape `\0`, never as a literal NUL byte. Avoid non-null assertions; the repository lint contract rejects them.

```ts
// packages/curriculum-graph/src/cycles.ts
import {
  failure,
  hasErrors,
  internalErrorDiagnostic,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import type { CurriculumGraph } from './types.js';

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathKey(path: readonly string[]): string {
  return path.join('\0');
}

function canonicalizeCycle(cycle: readonly string[]): readonly string[] {
  const ring = cycle.slice(0, -1);
  const first = ring[0];
  if (first === undefined) return cycle;

  let canonical = [...ring];
  for (let index = 1; index < ring.length; index += 1) {
    const candidate = [...ring.slice(index), ...ring.slice(0, index)];
    if (compareCodepoints(pathKey(candidate), pathKey(canonical)) < 0) {
      canonical = candidate;
    }
  }

  const canonicalStart = canonical[0];
  return canonicalStart === undefined ? cycle : [...canonical, canonicalStart];
}

export function findPrerequisiteCycles(graph: CurriculumGraph): readonly (readonly string[])[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== 'prerequisite') continue;
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }
  for (const targets of adjacency.values()) targets.sort(compareCodepoints);

  const visited = new Set<string>();
  const active = new Map<string, number>();
  const stack: string[] = [];
  const cycles = new Map<string, readonly string[]>();

  const visit = (node: string): void => {
    const activeIndex = active.get(node);
    if (activeIndex !== undefined) {
      const canonical = canonicalizeCycle([...stack.slice(activeIndex), node]);
      cycles.set(pathKey(canonical), canonical);
      return;
    }
    if (visited.has(node)) return;

    active.set(node, stack.length);
    stack.push(node);
    for (const target of adjacency.get(node) ?? []) visit(target);
    stack.pop();
    active.delete(node);
    visited.add(node);
  };

  for (const node of [...graph.nodes.keys()].sort(compareCodepoints)) visit(node);
  return [...cycles.values()].sort((left, right) => compareCodepoints(pathKey(left), pathKey(right)));
}

export function cycleDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  return findPrerequisiteCycles(graph).map((cycle) => {
    const start = cycle[0];
    return {
      code: 'CURRICULUM_GRAPH_003',
      severity: 'error',
      location: {
        file: start === undefined ? '<curriculum>' : (graph.nodes.get(start)?.filePath ?? '<curriculum>'),
      },
      observed: cycle,
      expected: 'An acyclic prerequisite graph',
      reason: `Prerequisite cycle detected: ${cycle.join(' -> ')}`,
      remediation: 'Remove or redirect at least one prerequisite edge in the reported cycle',
      documentation: 'docs/architecture/curriculum-graph.md#cycles',
    };
  });
}

export function validatePrerequisiteCycles(
  graph: CurriculumGraph,
): ValidationOutcome<CurriculumGraph> {
  try {
    const diagnostics = cycleDiagnostics(graph);
    return hasErrors(diagnostics) ? failure(diagnostics) : success(graph, diagnostics);
  } catch (error) {
    return failure([internalErrorDiagnostic(error, '<curriculum-graph>')]);
  }
}
```

`findPrerequisiteCycles` is the only traversal. `cycleDiagnostics` must reuse it. `validatePrerequisiteCycles` must call `cycleDiagnostics`, return the original graph on success, fail on every reported cycle, convert unexpected exceptions through `internalErrorDiagnostic`, and never throw. Do not add test-only production seams.

Run the low-level tests again before adding fixture documents. All low-level tests must pass while the fixture-level tests below still fail because their directories/documents do not exist.

- [ ] **Step 4: Add schema-loaded fixture tests, capture fixture RED, then create draft-track fixtures and export APIs**

Extend `cycles.test.ts` with fixture-level tests using `graphFixture`. Write and run these tests before creating any fixture document:

```ts
import { graphFixture } from './support/graph-fixture.js';

it.each([
  ['invalid/self-cycle', ['track-cycle-a', 'track-cycle-a']],
  ['invalid/two-node-cycle', ['track-cycle-a', 'track-cycle-b', 'track-cycle-a']],
  [
    'invalid/multi-node-cycle',
    ['track-cycle-a', 'track-cycle-b', 'track-cycle-c', 'track-cycle-a'],
  ],
] as const)('reports the exact canonical cycle for %s', async (fixture, expected) => {
  const graphOutcome = await graphFixture(fixture);
  expect(graphOutcome.ok).toBe(true);
  if (!graphOutcome.ok) return;
  expect(cycleDiagnostics(graphOutcome.value)).toEqual([
    expect.objectContaining({ code: 'CURRICULUM_GRAPH_003', observed: expected }),
  ]);
});
```

Run the focused test and capture the genuine fixture-level RED caused by the absent fixture path/documents. Record the exact command, working directory, exit status, observed test count, relevant stdout/stderr, channel-integrity label, and why this failure proves the fixture behavior is missing.

Then create only draft track documents with schema-valid metadata:

```text
self-cycle       -> track-cycle-a -> track-cycle-a
two-node-cycle   -> track-cycle-a -> track-cycle-b -> track-cycle-a
multi-node-cycle -> track-cycle-a -> track-cycle-b -> track-cycle-c -> track-cycle-a
```

Every fixture track must use `kind: track`, `status: draft`, `requiredCompetencies: []`, `modules: []`, valid slug/title/description/schema/version fields, and only the `prerequisites` needed for that fixture's edges. Do not create competency, module, lesson, assessment, remediation, milestone, or other support documents. The graph must build without `CURRICULUM_REFERENCE_001`; cycle failure is represented only by `CURRICULUM_GRAPH_003` from `cycleDiagnostics`/`validatePrerequisiteCycles`, not by publication or completeness diagnostics.

Modify `packages/curriculum-graph/src/index.ts` only to export the Task 6 APIs:

```ts
export * from './cycles.js';
```

Task 7 continues composing `cycleDiagnostics(graph)` directly with publication and completeness diagnostics. Do not make Task 7 consume `validatePrerequisiteCycles` or duplicate cycle traversal.

- [ ] **Step 5: Run fresh GREEN verification and commit**

Run each command separately and record its real exit status/output:

```bash
pnpm --filter @roadmap/curriculum-graph test -- cycles.test.ts
pnpm --filter @roadmap/curriculum-graph test
pnpm --filter @roadmap/curriculum-graph check
pnpm check
git diff --check
```

Required acceptance evidence:

- Every cyclic reference-resolved graph produces at least one deterministic `CURRICULUM_GRAPH_003` witness; the required self, two-node, and multi-node paths are closed, rotation-normalized, deduplicated, and exact.
- An acyclic graph returns no cycles and `validatePrerequisiteCycles` returns success containing the original graph.
- A cyclic graph returns failure with `CURRICULUM_GRAPH_003`, including the deterministic closed path in `observed`; no cycle is accepted silently.
- An unexpected traversal exception is converted to `VALIDATOR_INTERNAL_001` through `internalErrorDiagnostic`; the wrapper never throws.
- `cycleDiagnostics` remains independently usable by Task 7 and reuses `findPrerequisiteCycles`; there is no second cycle algorithm or nested outcome composition.
- Draft-track fixtures parse/build without unrelated reference, publication, or completeness failures.
- The source file is strict UTF-8 text with no literal NUL bytes; codepoint comparison, not locale collation, determines canonical paths.
- `src/index.ts` exports the cycle APIs; all focused/package/root checks pass.

```bash
git add packages/curriculum-graph/src/cycles.ts packages/curriculum-graph/src/index.ts packages/curriculum-graph/test/cycles.test.ts fixtures/curriculum/invalid/self-cycle fixtures/curriculum/invalid/two-node-cycle fixtures/curriculum/invalid/multi-node-cycle
git commit -m "feat: detect curriculum prerequisite cycles"
```

### Task 7: Validate publication and curriculum completeness rules

**Files:**
- Create: `packages/curriculum-graph/src/publication.ts`
- Create: `packages/curriculum-graph/src/completeness.ts`
- Create: `packages/curriculum-graph/src/validate.ts`
- Create: `packages/curriculum-graph/test/publication.test.ts`
- Create: `packages/curriculum-graph/test/completeness.test.ts`
- Create: `packages/curriculum-graph/test/support/validate-fixture.ts`
- Create: `packages/curriculum-graph/test/support/graph-builder.ts`
- Create: `fixtures/curriculum/invalid/published-to-draft/**/*.md`
- Create: `fixtures/curriculum/invalid/published-to-draft-reverse/**/*.md`
- Create: `fixtures/curriculum/invalid/published-to-review-reverse/**/*.md`
- Create: `fixtures/curriculum/invalid/orphan-competency/**/*.md`
- Create: `fixtures/curriculum/invalid/missing-assessment/**/*.md`
- Create: `fixtures/curriculum/invalid/missing-remediation/**/*.md`
- Create: `fixtures/curriculum/invalid/unreachable-milestone/**/*.md`
- Modify: `packages/curriculum-graph/src/index.ts`

**Interfaces:**
- Consumes: a reference-resolved `CurriculumGraph` with `declaredReferences` and normalized structural edges (cycles are validated here, not pre-excluded)
- Produces: `validateCurriculumGraph(graph): ValidationOutcome<CurriculumGraph>`

- [ ] **Step 1: Write failing publication and completeness tests**

```ts
// packages/curriculum-graph/test/publication.test.ts
import { describe, expect, it } from 'vitest';
import { validateFixture } from './support/validate-fixture.js';

describe('publication edges', () => {
  it('rejects a published node depending on draft content', async () => {
    const outcome = await validateFixture('invalid/published-to-draft');
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CURRICULUM_PUBLICATION_001' })]),
    );
  });

  it.each(['invalid/published-to-draft-reverse', 'invalid/published-to-review-reverse'])(
    'rejects %s even when the normalized containment edge points in the opposite direction',
    async (fixture) => {
      const outcome = await validateFixture(fixture);
      expect(outcome.ok).toBe(false);
      expect(outcome.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'CURRICULUM_PUBLICATION_001',
            location: expect.objectContaining({
              file: expect.stringMatching(/lesson.*\.md$/),
              pointer: 'module',
            }),
          }),
        ]),
      );
    },
  );

  it('does not flag a draft parent module containing a published lesson', async () => {
    const outcome = await validateFixture('valid/minimal');
    expect(outcome.diagnostics.map(({ code }) => code)).not.toContain(
      'CURRICULUM_PUBLICATION_001',
    );
  });
});
```

```ts
// packages/curriculum-graph/test/completeness.test.ts
import { describe, expect, it } from 'vitest';
import { validateFixture } from './support/validate-fixture.js';
import { buildIsolatedGraph } from './support/graph-builder.js';
import { completenessDiagnostics } from '../src/completeness.js';

describe('required competency completeness', () => {
  it.each([
    ['invalid/orphan-competency', 'CURRICULUM_COMPLETENESS_001'],
    ['invalid/missing-assessment', 'CURRICULUM_COMPLETENESS_002'],
    ['invalid/missing-remediation', 'CURRICULUM_COMPLETENESS_003'],
    ['invalid/unreachable-milestone', 'CURRICULUM_COMPLETENESS_004'],
  ])('rejects %s with %s', async (fixture, code) => {
    const outcome = await validateFixture(fixture);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);
  });
});

describe('active track definition', () => {
  it.each([
    ['published', true],
    ['draft', false],
    ['review', false],
    ['deprecated', false],
    ['withdrawn', false],
  ] as const)('treats a %s track as active root: %s', (status, isActive) => {
    // buildIsolatedGraph constructs a published module containing a published
    // competency and milestone, plus one orphan competency and one orphan
    // milestone, all under a single track whose status is the parameter.
    const graph = buildIsolatedGraph({ trackStatus: status });
    const codes = completenessDiagnostics(graph).map(({ code }) => code);
    if (isActive) {
      expect(codes).toContain('CURRICULUM_COMPLETENESS_001');
      expect(codes).toContain('CURRICULUM_COMPLETENESS_004');
    } else {
      expect(codes).not.toContain('CURRICULUM_COMPLETENESS_001');
      expect(codes).not.toContain('CURRICULUM_COMPLETENESS_004');
    }
  });
});
```

The last case proves an otherwise reachable competency or milestone does not become complete — or incomplete — solely through a non-published track: with no active root, no root-relative completeness verdict applies.

Create `packages/curriculum-graph/test/support/validate-fixture.ts` (load → build → validate, no file mutation) and `packages/curriculum-graph/test/support/graph-builder.ts` (deterministic in-memory `CurriculumGraph` construction for status-matrix tests).

- [ ] **Step 2: Run the tests and confirm the validators are missing**

```bash
pnpm --filter @roadmap/curriculum-graph test
```

Expected: missing-module failures for `publication.ts`, `completeness.ts`, or the support helpers. Record the original RED capture (command, working directory, exit status, observed count, stdout, stderr, channel-integrity label, and why the failure proves the missing behavior).

- [ ] **Step 3: Implement declaration-driven publication validation**

Publication validation iterates `graph.declaredReferences`, never `CurriculumEdge.from`. Declaration ownership stays declaring document → referenced target regardless of normalized structural direction.

```ts
// packages/curriculum-graph/src/publication.ts
import type { Diagnostic } from '@roadmap/validation-core';
import type { CurriculumGraph } from './types.js';

const invalidTargets = new Set(['draft', 'review']);

export function publicationDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const reference of graph.declaredReferences) {
    const source = graph.nodes.get(reference.declaringId);
    const target = graph.nodes.get(reference.targetId);
    if (!source || !target) continue;
    if (source.data.status === 'published' && invalidTargets.has(target.data.status)) {
      diagnostics.push({
        code: 'CURRICULUM_PUBLICATION_001',
        severity: 'error',
        location: { file: reference.sourceFile, pointer: reference.pointer },
        observed: {
          source: reference.declaringId,
          target: reference.targetId,
          targetStatus: target.data.status,
        },
        expected: 'Published content references only published, deprecated, or withdrawn content',
        reason: 'Production curriculum cannot depend on content excluded from production',
        remediation: 'Publish the dependency or remove the reference from the published item',
        documentation: 'docs/authoring/publication-states.md',
      });
    }
  }
  return diagnostics;
}
```

- [ ] **Step 4: Implement reachability and required-evidence checks**

An active track is exactly a track whose `status` is `published`. `draft`, `review`, `deprecated`, and `withdrawn` tracks never establish a completeness root, even when their content remains visible for URL, migration, or explanation purposes.

`completenessDiagnostics` must enforce:

```text
CURRICULUM_COMPLETENESS_001
└── A required competency is not contained by any module reachable from an active track

CURRICULUM_COMPLETENESS_002
└── A required competency has no resolved `assesses` edge to an assessment in the registry

CURRICULUM_COMPLETENESS_003
└── A required competency has no resolved `remediates` edge to a remediation lesson in the registry

CURRICULUM_COMPLETENESS_004
└── A milestone cannot be reached from any active track through contains edges
```

A required competency is a `competency`-kind node in the registry (the schema requires non-empty `assessments` and `remediation` declarations, so every competency is required). Resolve assessment and remediation reachability through the normalized `assesses` and `remediates` edges, requiring at least one edge from the competency to a target present in the registry; those edges are normalized from `competency.assessments` and `competency.remediation` in the Task 5 matrix. Task 5 deliberately does not emit `CURRICULUM_REFERENCE_002` for these two relations: an existing wrong-kind target remains normalized, and Task 7 owns the target-kind check and must emit `CURRICULUM_COMPLETENESS_002` or `CURRICULUM_COMPLETENESS_003`. An absent target ID still belongs to Task 5 and emits `CURRICULUM_REFERENCE_001`. Use graph traversal from each `track.modules` containment edge rather than inferring reachability from file location. Diagnostics report the failing entity ID, its source file, and the pointer of the relevant field when one exists; resolve source file and pointer from the matching `declaredReferences` entry, never from `CurriculumEdge.from`.

- [ ] **Step 5: Compose all graph validators with internal-error containment**

```ts
// packages/curriculum-graph/src/validate.ts
import {
  failure,
  hasErrors,
  internalErrorDiagnostic,
  mergeDiagnostics,
  success,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { cycleDiagnostics } from './cycles.js';
import { completenessDiagnostics } from './completeness.js';
import { publicationDiagnostics } from './publication.js';
import type { CurriculumGraph } from './types.js';

export function validateCurriculumGraph(
  graph: CurriculumGraph,
): ValidationOutcome<CurriculumGraph> {
  try {
    const diagnostics = mergeDiagnostics(
      cycleDiagnostics(graph),
      publicationDiagnostics(graph),
      completenessDiagnostics(graph),
    );
    return hasErrors(diagnostics) ? failure(diagnostics) : success(graph, diagnostics);
  } catch (error) {
    return failure([internalErrorDiagnostic(error, '<curriculum-graph>')]);
  }
}
```

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @roadmap/curriculum-graph test
pnpm --filter @roadmap/curriculum-graph check
pnpm check
git diff --check
git add packages/curriculum-graph fixtures/curriculum/invalid/published-to-draft fixtures/curriculum/invalid/published-to-draft-reverse fixtures/curriculum/invalid/published-to-review-reverse fixtures/curriculum/invalid/orphan-competency fixtures/curriculum/invalid/missing-assessment fixtures/curriculum/invalid/missing-remediation fixtures/curriculum/invalid/unreachable-milestone
git commit -m "feat: validate curriculum publication and completeness"
```

Required acceptance evidence before commit: the published-only active-root matrix passes, the reverse-direction publication fixtures fail with `CURRICULUM_PUBLICATION_001` at the declaring lesson file and `module` pointer, and the four completeness fixtures each fail with their declared code.

### Task 8: Add the fail-closed content-validation CLI and Spike 2 gate

**Files:**
- Create: `tooling/validate-content/package.json`
- Create: `tooling/validate-content/tsconfig.json`
- Create: `tooling/validate-content/vitest.config.ts`
- Create: `tooling/validate-content/src/main.ts`
- Create: `tooling/validate-content/test/cli.test.ts`
- Create: `scripts/verify-wp-02-03.mjs`
- Create: `fixtures/curriculum/valid/governance-boundary/**/*.md`
- Create: `fixtures/curriculum/invalid/malformed-markdown/**/*.md`
- Modify: `packages/curriculum-loader/src/load-curriculum.ts`
- Modify: `packages/curriculum-loader/test/loader.test.ts`
- Modify: `package.json`
- Modify: `scripts/config-contract.test.mjs`

**Interfaces:**
- Consumes: loader and graph packages, plus the existing root-script contract
- Human interface: `pnpm content:validate [root] [--format text]`
  - Produces readable diagnostics for developer workflow.
  - Exits non-zero for every validation error or internal exception.
  - The pnpm wrapper's stdout is not a machine-readable interface and may include pnpm lifecycle
    failure text.
- Machine interface:
  `pnpm exec tsx tooling/validate-content/src/main.ts [root] --format json`
  - Produces deterministic, parseable JSON on stdout.
  - Keeps stderr as the diagnostic/error channel; the validator must not leak package-runner
    lifecycle output into its own stdout.
  - Uses the validator process exit code to represent the validation result.
- Gate interfaces: `pnpm content:validate:curriculum` and `pnpm verify:wp-02-03`

**Late execution-time amendment:** Task 8's first real canonical-root gate exposed that the
mandatory `curriculum/AGENTS.md` governance file was being discovered and parsed as a curriculum
artifact, producing `CURRICULUM_PARSE_001`. This was not resolved during initial preflight. The
loader contract now excludes files named exactly `AGENTS.md` at any depth; this is a loader-wide
discovery rule, not CLI-only filtering. The CLI continues validating the canonical `curriculum/`
root. Missing required artifacts, malformed non-`AGENTS.md` artifacts, and every other graph or
schema failure remain fail-closed.

**Late command-boundary amendment:** Whole-branch execution established that the validator's direct
CLI already provides deterministic JSON, while the failing `pnpm content:validate ... --format
json` wrapper appends pnpm lifecycle text after the JSON document. The earlier plan wording
incorrectly conflated those two process boundaries. This correction was discovered after the
original Task 8 implementation and review; it must not be represented as initial preflight
evidence. Do not change repository-wide pnpm reporter settings, silence pnpm globally, add a shell
wrapper, or require wrapper stdout to parse as JSON. The human command remains the developer gate;
automation that consumes JSON must invoke the CLI directly.

- [ ] **Step 1: Write focused loader tests and fixtures for the governance boundary**

Before changing production code, add real loader coverage that proves:

- The canonical repository `curriculum/` root loads without attempting to parse its root
  `AGENTS.md`, and no loaded document has the basename `AGENTS.md`.
- `fixtures/curriculum/valid/governance-boundary/` contains invalid-as-curriculum governance files
  at both `AGENTS.md` and `some/path/AGENTS.md`, plus one schema-valid normal curriculum `.md`
  artifact. Loading the root succeeds with exactly the normal artifact.
- `fixtures/curriculum/invalid/malformed-markdown/AGENTS.md` is ignored, but malformed
  non-governance candidates named `README.md`, `agents.md`, `NOT-AGENTS.md`, and `AGENTS.mdx` in
  the same root each return `CURRICULUM_PARSE_001` at their own file location. These near-name
  cases make the exact, case-sensitive basename rule observable: no other `.md` or `.mdx` filename
  may be excluded.

The governance fixture files intentionally have no curriculum frontmatter. Against the current
loader, the first two success cases must fail because `AGENTS.md` is discovered and sent to
artifact parsing. The production change that makes them pass is the exact-name discovery filter;
do not add parser fallback or weaken schema validation.

- [ ] **Step 2: Capture the loader RED, implement the exact discovery rule, and prove GREEN**

Run the focused test before editing `load-curriculum.ts`:

```bash
pnpm --filter @roadmap/curriculum-loader exec vitest run --config vitest.config.ts test/loader.test.ts
```

Record the command, working directory, exit status, test count, stdout, stderr, and channel
integrity. Required RED: the governance success coverage fails because an `AGENTS.md` path produces
`CURRICULUM_PARSE_001`; the four malformed near-name candidates already fail closed with all four
file locations present.

Then make the minimal production change in `load-curriculum.ts`: exclude a directory entry only
when `entry.name === 'AGENTS.md'`, before adding it to the deterministic candidate list. Because
discovery is recursive, the same exact rule applies at root and nested depths. Do not add a CLI
filter or any broader ignore convention.

Rerun the same focused command. Required GREEN: root and nested governance files are absent from
the corpus, the normal `.md` artifact is present, and the malformed non-governance candidates
`README.md`, `agents.md`, `NOT-AGENTS.md`, and `AGENTS.mdx` still each return
`CURRICULUM_PARSE_001` at their own file location.

- [ ] **Step 3: Write CLI tests for the distinct human and machine command boundaries**

```ts
// tooling/validate-content/test/cli.test.ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(root, 'tooling/validate-content/src/main.ts');

function runMachine(args: readonly string[]) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('pnpm CLI path is unavailable in the test environment');
  return spawnSync(process.execPath, [pnpmCli, 'exec', 'tsx', cli, ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

function runHuman(args: readonly string[]) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('pnpm CLI path is unavailable in the test environment');
  return spawnSync(process.execPath, [pnpmCli, 'content:validate', ...args], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

describe('validate-content CLI', () => {
  it('keeps direct machine JSON parseable for a failing fixture', () => {
    const result = runMachine([
      'fixtures/curriculum/invalid/multi-node-cycle',
      '--format',
      'json',
    ]);
    const diagnostics: unknown = JSON.parse(result.stdout);
    expect(result.status).toBe(1);
    expect(Array.isArray(diagnostics)).toBe(true);
    expect(result.stderr).toBe('');
  });

  it('keeps the pnpm wrapper as a readable fail-closed human gate', () => {
    const result = runHuman([
      'fixtures/curriculum/invalid/multi-node-cycle',
      '--format',
      'text',
    ]);
    expect(result.status).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain('CURRICULUM_GRAPH_003');
    expect(result.stderr).toContain('Expected:');
    expect(result.stderr).toContain('Remediation:');
  });

  it('exits zero for the valid minimal graph through the machine interface', () => {
    const result = runMachine(['fixtures/curriculum/valid/minimal', '--format', 'json']);
    expect(result.status).toBe(0);
  });

  it('exits zero for the canonical curriculum root through the machine interface', () => {
    const result = runMachine(['curriculum', '--format', 'json']);
    expect(result.status).toBe(0);
  });
});
```

Before changing tests or production code, capture the command boundary with separate stdout and
stderr pipes:

1. Invoke the direct machine command against `fixtures/curriculum/invalid/multi-node-cycle`.
   Required characterization: exit `1`, stdout parses as a JSON diagnostic array containing
   `CURRICULUM_GRAPH_003`, and stderr is empty.
2. Invoke `pnpm content:validate fixtures/curriculum/invalid/multi-node-cycle --format json` and
   attempt to parse its complete stdout as one JSON document. Required contract RED: the current
   pnpm wrapper exits `1`, includes the validator JSON followed by pnpm lifecycle failure text, and
   the parse attempt fails. This is RED against the old conflated interface requirement, not a
   validator-production defect.

Permanent regression tests must exercise the direct invocation when parsing JSON and the pnpm
wrapper when asserting the readable human gate. They must not require pnpm wrapper JSON to remain
unparseable: pnpm-owned lifecycle formatting is outside this repository's validator contract. If
the current production behavior already satisfies both corrected interfaces, do not invent a
production change; record the contract characterization and commit the focused regression coverage
separately.

- [ ] **Step 4: Run the focused tests and confirm the required CLI behavior**

```bash
pnpm --filter @roadmap/validate-content test
```

- [ ] **Step 5: Implement the CLI composition and output contract**

The module must be import-safe: importing `main.ts` registers no side effects and never runs validation. Direct execution happens only behind an entry-point guard, so the exception-containment unit test can import `validateContent` without spawning a second CLI run.

```ts
// tooling/validate-content/src/main.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { failure, internalErrorDiagnostic, type ValidationOutcome } from '@roadmap/validation-core';

export interface ContentValidatorDependencies {
  load: typeof loadCurriculum;
  buildGraph: typeof buildCurriculumGraph;
  validateGraph: typeof validateCurriculumGraph;
}

const defaultDependencies: ContentValidatorDependencies = {
  load: loadCurriculum,
  buildGraph: buildCurriculumGraph,
  validateGraph: validateCurriculumGraph,
};

export async function validateContent(
  root: string,
  dependencies: ContentValidatorDependencies = defaultDependencies,
): Promise<ValidationOutcome<unknown>> {
  try {
    const corpus = await dependencies.load(root);
    if (!corpus.ok) return corpus;
    const graph = dependencies.buildGraph(corpus.value);
    if (!graph.ok) return graph;
    return dependencies.validateGraph(graph.value);
  } catch (error) {
    return failure([internalErrorDiagnostic(error, root)]);
  }
}

export function parseArguments(args: readonly string[]): { root: string; format: 'text' | 'json' } {
  let root = 'curriculum';
  let format: 'text' | 'json' = 'text';
  let rootSeen = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === '--format') {
      const value = args[index + 1];
      if (value !== 'text' && value !== 'json') throw new Error('--format must be text or json');
      format = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    if (rootSeen) throw new Error(`Unexpected positional argument: ${argument}`);
    root = argument;
    rootSeen = true;
  }
  return { root: path.resolve(root), format };
}

async function main(): Promise<void> {
  let parsed: { root: string; format: 'text' | 'json' };
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    const outcome = failure([internalErrorDiagnostic(error, '<arguments>')]);
    console.log(JSON.stringify(outcome.diagnostics, null, 2));
    process.exitCode = 1;
    return;
  }

  const outcome = await validateContent(parsed.root);

  if (parsed.format === 'json') console.log(JSON.stringify(outcome.diagnostics, null, 2));
  else {
    for (const diagnostic of outcome.diagnostics) {
      console.error(`${diagnostic.code} ${diagnostic.location.file}: ${diagnostic.reason}`);
      console.error(`  Expected: ${diagnostic.expected}`);
      console.error(`  Remediation: ${diagnostic.remediation}`);
    }
  }

  if (!outcome.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
```

Argument-parse failures also fail closed as `VALIDATOR_INTERNAL_001` with exit `1` — a malformed invocation is never a silent success.

Add a direct unit test for exception containment by injecting a `load` dependency that throws:

```ts
it('turns an unexpected dependency exception into VALIDATOR_INTERNAL_001', async () => {
  const result = await validateContent('curriculum', {
    load: async () => { throw new Error('boom'); },
    buildGraph: buildCurriculumGraph,
    validateGraph: validateCurriculumGraph,
  });
  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]?.code).toBe('VALIDATOR_INTERNAL_001');
});
```

This proves exception containment through an explicit dependency seam without adding a test-only production behavior.

- [ ] **Step 6: Update the root-script contract and add domain-aware commands**

The existing `scripts/config-contract.test.mjs` assertion locks `scripts.test` to the bootstrap-only command. Update that assertion surgically — preserve its `check` assertion and every unrelated test — so the contract requires the new mapping:

```js
// scripts/config-contract.test.mjs (updated assertion only)
test('root scripts expose check and domain-aware tests', async () => {
  const packageJson = await readJson('package.json');
  assert.equal(typeof packageJson.scripts.check, 'string');
  assert.equal(packageJson.scripts['test:bootstrap'], 'node --test scripts/*.test.mjs');
  assert.equal(packageJson.scripts['test:wp-00-01-gate'], 'node --test scripts/wp-00-01-gate.integration.mjs');
  assert.equal(packageJson.scripts['test:unit'], 'vitest run');
  assert.equal(
    packageJson.scripts.test,
    'node scripts/run-pipeline.mjs test:bootstrap test:unit',
  );
});
```

Merge these mappings into the current root `scripts` object. `test:bootstrap` and `test:wp-00-01-gate` keep their existing verified commands exactly; do not remove, rename, fold, or recursively invoke them:

```json
{
  "scripts": {
    "test:bootstrap": "node --test scripts/*.test.mjs",
    "test:wp-00-01-gate": "node --test scripts/wp-00-01-gate.integration.mjs",
    "test:unit": "vitest run",
    "test": "node scripts/run-pipeline.mjs test:bootstrap test:unit",
    "content:validate": "pnpm --filter @roadmap/validate-content start --",
    "content:validate:curriculum": "pnpm content:validate curriculum --format text",
    "verify:wp-02-03": "node scripts/verify-wp-02-03.mjs",
    "verify": "node scripts/run-pipeline.mjs check test content:validate:curriculum schema:check"
  }
}
```

The command graph must be acyclic: `test` invokes `test:bootstrap` and `test:unit` only; no script invokes `test` except `verify` and `verify:wp-02-03` through the pipeline; `test:wp-00-01-gate` is never selected by the `scripts/*.test.mjs` glob (it lives at `scripts/wp-00-01-gate.integration.mjs`, which does not match `*.test.mjs`).

`tooling/validate-content/package.json` exposes:

```json
{
  "scripts": {
    "start": "tsx src/main.ts",
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  }
}
```

Before committing Task 8, prove with separately captured evidence:

- The focused root-script contract test passes: `node --test scripts/config-contract.test.mjs`
- `pnpm test:bootstrap` executes the bootstrap tests once
- `pnpm test:unit` executes the intended Vitest projects once
- `pnpm test` executes both stages once, in order
- `pnpm test:wp-00-01-gate` passes independently and is not selected by the bootstrap glob
- `pnpm verify:wp-00-01` remains independently executable and passes
- The command graph is non-recursive (no script eventually invokes itself)
- All pre-existing public commands remain present: `dev`, `format`, `format:check`, `lint`, `typecheck`, `check`, `policy:check`, `verify:wp-00-01`, `verify:templates`, `verify:release`
- `pnpm verify:templates` and `pnpm verify:release` still return the intentional unavailable exit `2` (this WP-02–03 amendment does not approve changing them)

- [ ] **Step 7: Implement and run the Spike 2 gate**

```js
// scripts/verify-wp-02-03.mjs
import { runPipeline } from './run-pipeline.mjs';

await runPipeline([
  'check',
  'test',
  'schema:check',
  'content:validate:curriculum',
]);
```

Run:

```bash
pnpm --filter @roadmap/curriculum-loader test
pnpm --filter @roadmap/validate-content test
pnpm content:validate:curriculum
pnpm content:validate fixtures/curriculum/invalid/multi-node-cycle --format text
pnpm exec tsx tooling/validate-content/src/main.ts fixtures/curriculum/invalid/multi-node-cycle --format json
pnpm verify:wp-02-03
```

The canonical-root command and Spike 2 gate must exit `0`. The human invalid command must emit
readable `CURRICULUM_GRAPH_003`, `Expected:`, and `Remediation:` text and exit `1`. The direct
machine command must exit `1`, leave stderr empty, and produce stdout that parses as one JSON
diagnostic array containing `CURRICULUM_GRAPH_003`. Do not parse the pnpm wrapper's complete stdout
as the machine interface.

Then run every invalid fixture through the human gate and record the expected code:

```bash
pnpm content:validate fixtures/curriculum/invalid/malformed-markdown
pnpm content:validate fixtures/curriculum/invalid/missing-reference
pnpm content:validate fixtures/curriculum/invalid/duplicate-id
pnpm content:validate fixtures/curriculum/invalid/self-cycle
pnpm content:validate fixtures/curriculum/invalid/two-node-cycle
pnpm content:validate fixtures/curriculum/invalid/multi-node-cycle
pnpm content:validate fixtures/curriculum/invalid/published-to-draft
```

Expected: each invalid command exits non-zero and prints its declared stable diagnostic code.
`malformed-markdown` prints `CURRICULUM_PARSE_001`, and `missing-reference` prints
`CURRICULUM_REFERENCE_001`, proving the governance exclusion did not weaken malformed-artifact or
required-reference validation.

- [ ] **Step 8: Commit**

```bash
git add tooling/validate-content scripts/verify-wp-02-03.mjs packages/curriculum-loader/src/load-curriculum.ts packages/curriculum-loader/test/loader.test.ts fixtures/curriculum/valid/governance-boundary fixtures/curriculum/invalid/malformed-markdown package.json pnpm-lock.yaml scripts/config-contract.test.mjs
git commit -m "feat: add fail closed curriculum validation cli"
```

WP-02–03 is complete only after Spike 2 passes and an independent reviewer confirms all of the
following: exact-name governance exclusion works at root and nested depths, `AGENTS.md` never enters
loaded artifacts, near-name `.md`/`.mdx` files prove that the rule is exact and case-sensitive,
normal Markdown still loads, malformed non-governance Markdown and missing references still fail
closed, the canonical `curriculum/` root is the gate target, the human `pnpm content:validate`
command remains readable and fail-closed, the direct CLI JSON interface remains parseable with
stderr/channel integrity and validation-result exit codes, no acceptance criterion requires pnpm
wrapper stdout to be pure JSON, and the tests cannot pass when an invalid graph is accepted.
