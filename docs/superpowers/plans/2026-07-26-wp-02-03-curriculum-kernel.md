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
├── src/edges.ts
├── src/cycles.ts
├── src/publication.ts
├── src/completeness.ts
├── src/validate.ts
├── src/index.ts
└── test/*.test.ts

tooling/validate-content/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/main.ts
└── test/cli.test.ts

fixtures/curriculum/
├── valid/minimal/
└── invalid/
    ├── duplicate-id/
    ├── missing-reference/
    ├── self-cycle/
    ├── two-node-cycle/
    ├── multi-node-cycle/
    ├── published-to-draft/
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

### Task 3: Generate and drift-check JSON Schema

**Files:**
- Create: `packages/curriculum-schema/src/json-schema.ts`
- Create: `packages/curriculum-schema/generated/curriculum.schema.json`
- Create: `packages/curriculum-schema/test/json-schema.test.ts`
- Modify: `packages/curriculum-schema/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CurriculumEntitySchema`
- Produces: `generateCurriculumJsonSchema(): object` and `pnpm schema:generate`

- [ ] **Step 1: Write a failing drift test**

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

- [ ] **Step 2: Run the test and confirm the generator is missing**

```bash
pnpm --filter @roadmap/curriculum-schema test
```

Expected: missing module or missing generated file.

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

- [ ] **Step 4: Add a deterministic generation script**

Add `scripts/generate-json-schema.ts` at the repository root:

```js
import { writeFile } from 'node:fs/promises';
import { generateCurriculumJsonSchema } from '../packages/curriculum-schema/src/json-schema.ts';

const output = 'packages/curriculum-schema/generated/curriculum.schema.json';
const schema = generateCurriculumJsonSchema();
await writeFile(output, `${JSON.stringify(schema, null, 2)}\n`);
```

Execute through `tsx` or Node's supported type-stripping mode selected in WP-00. Pin the chosen runner exactly. Add:

```json
{
  "scripts": {
    "schema:generate": "tsx scripts/generate-json-schema.ts",
    "schema:check": "pnpm schema:generate && git diff --exit-code -- packages/curriculum-schema/generated/curriculum.schema.json"
  }
}
```

- [ ] **Step 5: Generate, test drift, and commit**

```bash
pnpm schema:generate
pnpm --filter @roadmap/curriculum-schema test
pnpm schema:check
git add scripts/generate-json-schema.ts packages/curriculum-schema/src/json-schema.ts packages/curriculum-schema/generated packages/curriculum-schema/test/json-schema.test.ts packages/curriculum-schema/package.json package.json pnpm-lock.yaml
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

Implement `loadCurriculum` using `fs.readdir({ recursive: true, withFileTypes: true })`, sort paths lexicographically for deterministic results, load `.md` and `.mdx`, collect all diagnostics, and return a corpus only when no error exists.

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
- Create: `packages/curriculum-graph/src/edges.ts`
- Create: `packages/curriculum-graph/src/index.ts`
- Create: `packages/curriculum-graph/test/registry.test.ts`
- Create: duplicate and missing-reference fixtures

**Interfaces:**
- Consumes: `CurriculumCorpus`
- Produces: `buildCurriculumGraph(corpus): ValidationOutcome<CurriculumGraph>`

- [ ] **Step 1: Write duplicate-ID and missing-reference tests**

```ts
// packages/curriculum-graph/test/registry.test.ts
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { buildCurriculumGraph } from '../src/index.js';

const fixtures = path.resolve(import.meta.dirname, '../../../fixtures/curriculum');

async function graphFixture(name: string) {
  const corpus = await loadCurriculum(path.join(fixtures, name));
  expect(corpus.ok).toBe(true);
  if (!corpus.ok) throw new Error('Fixture must pass schema validation');
  return buildCurriculumGraph(corpus.value);
}

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

- [ ] **Step 2: Run the tests and confirm graph exports are missing**

```bash
pnpm --filter @roadmap/curriculum-graph test
```

- [ ] **Step 3: Define graph nodes and typed edges**

```ts
// packages/curriculum-graph/src/types.ts
import type { CurriculumDocument } from '@roadmap/curriculum-schema';

export type EdgeType =
  | 'prerequisite'
  | 'contains'
  | 'assesses'
  | 'remediates'
  | 'milestone-project';

export interface CurriculumEdge {
  from: string;
  to: string;
  type: EdgeType;
  sourceFile: string;
}

export interface CurriculumGraph {
  nodes: ReadonlyMap<string, CurriculumDocument>;
  edges: readonly CurriculumEdge[];
}
```

- [ ] **Step 4: Implement registry and edge extraction**

`createRegistry` inserts documents in deterministic file order. On a duplicate, it emits one `CURRICULUM_ID_001` diagnostic naming both file paths and returns no graph.

`extractEdges` maps:

```text
entity.prerequisites          → prerequisite
track.modules                 → contains
module.lessons                → contains
competency.assessments        → assesses
competency.remediation        → remediates
milestone.project             → milestone-project
lesson.module                 → contains, with direction module → lesson
lesson.competencies           → contains, with direction competency → lesson
```

For each unresolved target, emit `CURRICULUM_REFERENCE_001` at the exact source file and frontmatter pointer.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @roadmap/curriculum-graph test
pnpm --filter @roadmap/curriculum-graph check
pnpm check
git add packages/curriculum-graph fixtures/curriculum/invalid/duplicate-id fixtures/curriculum/invalid/missing-reference package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: resolve curriculum graph references"
```

### Task 6: Detect complete prerequisite cycles

**Files:**
- Create: `packages/curriculum-graph/src/cycles.ts`
- Create: `packages/curriculum-graph/test/cycles.test.ts`
- Create: self, two-node, and multi-node cycle fixtures
- Modify: `packages/curriculum-graph/src/index.ts`

**Interfaces:**
- Consumes: `CurriculumGraph`
- Produces: `findPrerequisiteCycles(graph): readonly (readonly string[])[]` and `validatePrerequisiteCycles(graph)`

- [ ] **Step 1: Write tests for all required cycle shapes**

```ts
// packages/curriculum-graph/test/cycles.test.ts
import { describe, expect, it } from 'vitest';
import { findPrerequisiteCycles } from '../src/cycles.js';
import type { CurriculumGraph } from '../src/types.js';

function graph(edges: Array<[string, string]>): CurriculumGraph {
  const ids = new Set(edges.flat());
  return {
    nodes: new Map([...ids].map((id) => [id, { filePath: `${id}.md`, body: '', data: { id } } as never])),
    edges: edges.map(([from, to]) => ({ from, to, type: 'prerequisite', sourceFile: `${from}.md` })),
  };
}

describe('findPrerequisiteCycles', () => {
  it('returns a self-cycle as a closed path', () => {
    expect(findPrerequisiteCycles(graph([['a', 'a']]))).toEqual([['a', 'a']]);
  });

  it('returns a complete multi-node path', () => {
    expect(findPrerequisiteCycles(graph([['a', 'b'], ['b', 'c'], ['c', 'a']]))).toEqual([
      ['a', 'b', 'c', 'a'],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm the cycle function is missing**

```bash
pnpm --filter @roadmap/curriculum-graph test -- cycles.test.ts
```

- [ ] **Step 3: Implement deterministic depth-first cycle detection**

```ts
// packages/curriculum-graph/src/cycles.ts
import type { Diagnostic } from '@roadmap/validation-core';
import type { CurriculumGraph } from './types.js';

export function findPrerequisiteCycles(graph: CurriculumGraph): readonly (readonly string[])[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== 'prerequisite') continue;
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }
  for (const targets of adjacency.values()) targets.sort();

  const visited = new Set<string>();
  const active = new Map<string, number>();
  const stack: string[] = [];
  const cycles = new Map<string, readonly string[]>();

  const visit = (node: string) => {
    const activeIndex = active.get(node);
    if (activeIndex !== undefined) {
      const cycle = [...stack.slice(activeIndex), node];
      const ring = cycle.slice(0, -1);
      const rotations = ring.map((_, index) => [...ring.slice(index), ...ring.slice(0, index)]);
      rotations.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
      const canonical = [...rotations[0]!, rotations[0]![0]!];
      cycles.set(canonical.join(' -> '), canonical);
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

  for (const node of [...graph.nodes.keys()].sort()) visit(node);
  return [...cycles.values()];
}

export function cycleDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  return findPrerequisiteCycles(graph).map((cycle) => ({
    code: 'CURRICULUM_GRAPH_003',
    severity: 'error',
    location: { file: graph.nodes.get(cycle[0]!)?.filePath ?? '<curriculum>' },
    observed: cycle,
    expected: 'An acyclic prerequisite graph',
    reason: `Prerequisite cycle detected: ${cycle.join(' -> ')}`,
    remediation: 'Remove or redirect at least one prerequisite edge in the reported cycle',
    documentation: 'docs/architecture/curriculum-graph.md#cycles',
  }));
}
```

- [ ] **Step 4: Add fixture-level tests and integrate diagnostics into graph validation**

Load each fixture through `loadCurriculum`, build the graph, and assert:

```text
self-cycle       → a -> a
two-node-cycle   → a -> b -> a
multi-node-cycle → a -> b -> c -> a
```

The exact cycle path appears in the diagnostic `observed` field.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @roadmap/curriculum-graph test
pnpm check
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
- Create: publication and completeness fixtures
- Modify: `packages/curriculum-graph/src/index.ts`

**Interfaces:**
- Consumes: a reference-resolved acyclic `CurriculumGraph`
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
});
```

```ts
// packages/curriculum-graph/test/completeness.test.ts
import { describe, expect, it } from 'vitest';
import { validateFixture } from './support/validate-fixture.js';

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
```

- [ ] **Step 2: Run the tests and confirm the validators are missing**

```bash
pnpm --filter @roadmap/curriculum-graph test
```

- [ ] **Step 3: Implement publication-state edge validation**

```ts
// packages/curriculum-graph/src/publication.ts
import type { Diagnostic } from '@roadmap/validation-core';
import type { CurriculumGraph } from './types.js';

const invalidTargets = new Set(['draft', 'review']);

export function publicationDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const edge of graph.edges) {
    const source = graph.nodes.get(edge.from);
    const target = graph.nodes.get(edge.to);
    if (!source || !target) continue;
    if (source.data.status === 'published' && invalidTargets.has(target.data.status)) {
      diagnostics.push({
        code: 'CURRICULUM_PUBLICATION_001',
        severity: 'error',
        location: { file: source.filePath, pointer: edge.type },
        observed: { source: edge.from, target: edge.to, targetStatus: target.data.status },
        expected: 'Published content references only published, deprecated, or withdrawn content',
        reason: 'Production curriculum cannot depend on content excluded from production',
        remediation: 'Publish the dependency or remove the edge from the published item',
        documentation: 'docs/authoring/publication-states.md',
      });
    }
  }
  return diagnostics;
}
```

- [ ] **Step 4: Implement reachability and required-evidence checks**

`completenessDiagnostics` must enforce:

```text
CURRICULUM_COMPLETENESS_001
└── A required competency is not contained by any module in an active track

CURRICULUM_COMPLETENESS_002
└── A required competency has no resolved assessment edge

CURRICULUM_COMPLETENESS_003
└── A required competency has no resolved remediation edge

CURRICULUM_COMPLETENESS_004
└── A milestone cannot be reached from any active track through contains edges
```

Use graph traversal from each `track.modules` edge rather than inferring reachability from file location.

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
git add packages/curriculum-graph fixtures/curriculum/invalid/published-to-draft fixtures/curriculum/invalid/orphan-competency fixtures/curriculum/invalid/missing-assessment fixtures/curriculum/invalid/missing-remediation fixtures/curriculum/invalid/unreachable-milestone
git commit -m "feat: validate curriculum publication and completeness"
```

### Task 8: Add the fail-closed content-validation CLI and Spike 2 gate

**Files:**
- Create: `tooling/validate-content/package.json`
- Create: `tooling/validate-content/tsconfig.json`
- Create: `tooling/validate-content/vitest.config.ts`
- Create: `tooling/validate-content/src/main.ts`
- Create: `tooling/validate-content/test/cli.test.ts`
- Create: `scripts/verify-wp-02-03.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: loader and graph packages
- Produces: `pnpm content:validate [root]`, `pnpm verify:wp-02-03`, JSON diagnostics on stdout, and non-zero exit on every error or internal exception

- [ ] **Step 1: Write CLI tests for valid, invalid, and internal-failure paths**

```ts
// tooling/validate-content/test/cli.test.ts
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(root, 'tooling/validate-content/src/main.ts');

function run(fixture: string) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('pnpm CLI path is unavailable in the test environment');
  return spawnSync(process.execPath, [pnpmCli, 'exec', 'tsx', cli, fixture, '--format', 'json'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

describe('validate-content CLI', () => {
  it('exits zero for the valid minimal graph', () => {
    const result = run('fixtures/curriculum/valid/minimal');
    expect(result.status).toBe(0);
  });

  it('exits non-zero and prints stable diagnostic codes', () => {
    const result = run('fixtures/curriculum/invalid/multi-node-cycle');
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('CURRICULUM_GRAPH_003');
  });

});
```

- [ ] **Step 2: Run the tests and confirm the CLI is missing**

```bash
pnpm --filter @roadmap/validate-content test
```

- [ ] **Step 3: Implement the CLI composition and output contract**

```ts
// tooling/validate-content/src/main.ts
import path from 'node:path';
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

const { root, format } = parseArguments(process.argv.slice(2));
const outcome = await validateContent(root);

if (format === 'json') console.log(JSON.stringify(outcome.diagnostics, null, 2));
else {
  for (const diagnostic of outcome.diagnostics) {
    console.error(`${diagnostic.code} ${diagnostic.location.file}: ${diagnostic.reason}`);
    console.error(`  Expected: ${diagnostic.expected}`);
    console.error(`  Remediation: ${diagnostic.remediation}`);
  }
}

if (!outcome.ok) process.exitCode = 1;
```

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

- [ ] **Step 4: Replace root test and verification scripts with domain-aware commands**

Add:

```json
{
  "scripts": {
    "test:bootstrap": "node --test scripts/*.test.mjs",
    "test:unit": "vitest run",
    "test": "node scripts/run-pipeline.mjs test:bootstrap test:unit",
    "content:validate": "pnpm --filter @roadmap/validate-content start --",
    "content:validate:curriculum": "pnpm content:validate curriculum --format text",
    "verify:wp-02-03": "node scripts/verify-wp-02-03.mjs",
    "verify": "node scripts/run-pipeline.mjs check test content:validate:curriculum schema:check"
  }
}
```

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

- [ ] **Step 5: Implement and run the Spike 2 gate**

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
pnpm verify:wp-02-03
```

Then run every invalid fixture and record the expected code:

```bash
pnpm content:validate fixtures/curriculum/invalid/missing-reference
pnpm content:validate fixtures/curriculum/invalid/duplicate-id
pnpm content:validate fixtures/curriculum/invalid/self-cycle
pnpm content:validate fixtures/curriculum/invalid/two-node-cycle
pnpm content:validate fixtures/curriculum/invalid/multi-node-cycle
pnpm content:validate fixtures/curriculum/invalid/published-to-draft
```

Expected: each invalid command exits non-zero and prints its declared stable diagnostic code.

- [ ] **Step 6: Commit**

```bash
git add tooling/validate-content scripts/verify-wp-02-03.mjs package.json pnpm-lock.yaml
git commit -m "feat: add fail closed curriculum validation cli"
```

WP-02–03 is complete only after Spike 2 passes and an independent reviewer confirms the tests cannot pass when an invalid graph is accepted.
