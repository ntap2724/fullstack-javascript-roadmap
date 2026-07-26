# WP-05–06 Exercise, Rubric, Evidence, and Remediation Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Release 0 assessment kernel that materializes learner exercises, executes commands without a shell, distinguishes template health from learner completion, evaluates critical rubrics, validates evidence manifests, and returns actionable remediation.

**Architecture:** `command-runner` is the only package allowed to execute metadata commands. `exercise-contract` owns schemas and path constraints; `exercise-runner` materializes starter files and composes baseline or learner verification. `rubric-schema` and `evidence-schema` remain pure domain packages. `assessment-core` evaluates rubric scores and maps failed criteria to versioned remediation without depending on the website or GitHub.

**Tech Stack:** TypeScript strict mode, Zod 4, Vitest projects, `cross-spawn`, `picomatch`, Node.js filesystem and crypto APIs, YAML metadata, Markdown hints, and JSON evidence manifests.

## Global Constraints

- Metadata commands use `CommandSpec`; never execute curriculum strings with `shell: true`
- Baseline verification proves starter integrity; learner verification may intentionally fail before the learner implements the task
- Exercise tests check behavior and contracts, not reference-solution shape
- Every starter must fail at least one learner-facing test for the intended reason
- Every exercise has at least one edge or negative case
- Editable-path enforcement is fail closed and path-normalized
- Rubric completion is criterion-based; a high total score cannot hide a critical failure
- Evidence trust attestations remain explicit, independent, and never collapse into a generic `verified` boolean
- Remediation identifies the exact failed criterion, related competency, learning resources, and retake requirement
- Public solutions remain outside learner starter materialization
- Package code never imports Astro, Starlight, React, Express, or template-publication code

---

## File map

```text
packages/command-runner/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/run-command.ts
├── src/index.ts
└── test/run-command.test.ts

packages/exercise-contract/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/paths.ts
├── src/types.ts
├── src/index.ts
└── test/*.test.ts

packages/exercise-runner/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/load-exercise.ts
├── src/materialize.ts
├── src/open-workspace.ts
├── src/baseline-manifest.ts
├── src/verify-editable-paths.ts
├── src/verify-exercise.ts
├── src/index.ts
└── test/*.test.ts

packages/rubric-schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/evaluate.ts
├── src/index.ts
└── test/rubric.test.ts

packages/evidence-schema/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/schema.ts
├── src/trust.ts
├── src/index.ts
└── test/evidence.test.ts

packages/assessment-core/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/remediation.ts
├── src/result.ts
├── src/index.ts
└── test/assessment.test.ts

exercises/javascript/ex-js-closure-counter/
├── exercise.yaml
├── README.vi.md
├── starter/
│   ├── package.json
│   ├── src/counter.js
│   ├── test/infrastructure.test.js
├── tests/open/counter.contract.test.js
├── hints/01-concept.md
├── hints/02-diagnostic.md
├── hints/03-structure.md
├── walkthrough/README.vi.md
└── solution/src/counter.js

tooling/verify-exercise/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/main.ts
└── test/cli.test.ts
```

## Shared interfaces produced by this plan

```ts
export type VerificationMode = 'baseline' | 'learner';

export interface ExerciseWorkspace {
  exerciseId: string;
  root: string;
  baselineManifestPath: string;
}

export interface VerificationStepResult {
  id: string;
  required: boolean;
  command: CommandResult;
}

export interface ExerciseVerificationReport {
  exerciseId: string;
  mode: VerificationMode;
  status: 'passed' | 'failed' | 'internal-error';
  steps: readonly VerificationStepResult[];
  diagnostics: readonly Diagnostic[];
}
```

```ts
export type RubricScore = 0 | 1 | 2 | 3;

export interface CriterionResult {
  criterionId: string;
  critical: boolean;
  required: boolean;
  score: RubricScore | null;
  status: 'passed' | 'failed' | 'missing';
}

export interface RubricEvaluation {
  status: 'passed' | 'needs-remediation';
  criteria: readonly CriterionResult[];
  blockingCriterionIds: readonly string[];
}
```

```ts
export type EvidenceTrustLevel =
  | 'self-reported'
  | 'repository-verifiable'
  | 'ci-verified'
  | 'externally-observable'
  | 'human-reviewed';

export type EvidenceAttestations = readonly EvidenceTrustLevel[];
```

### Task 1: Implement an argv-based, timeout-aware command runner

**Files:**
- Create: `packages/command-runner/package.json`
- Create: `packages/command-runner/tsconfig.json`
- Create: `packages/command-runner/vitest.config.ts`
- Create: `packages/command-runner/src/run-command.ts`
- Create: `packages/command-runner/src/index.ts`
- Create: `packages/command-runner/test/run-command.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: shared `CommandSpec` and `CommandResult` names from the master plan
- Produces: `runCommand(spec: CommandSpec): Promise<CommandResult>`

- [ ] **Step 1: Add exact `cross-spawn` and type packages to the root catalog**

Run from the repository root:

```bash
pnpm add -Dw --save-exact cross-spawn @types/cross-spawn
```

Move the exact selected versions into the root `catalog` and use `catalog:` in the package below.

- [ ] **Step 2: Create the package manifest and a failing success-path test**

```json
{
  "name": "@roadmap/command-runner",
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
  "dependencies": {
    "cross-spawn": "catalog:"
  },
  "devDependencies": {
    "@types/cross-spawn": "catalog:",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/command-runner/test/run-command.test.ts
import { describe, expect, it } from 'vitest';
import { runCommand } from '../src/index.js';

const nodeCommand = process.execPath;

const spec = (source: string, timeoutMs = 5_000) => ({
  command: nodeCommand,
  args: ['--input-type=module', '--eval', source],
  cwd: process.cwd(),
  timeoutMs,
});

describe('runCommand', () => {
  it('captures stdout, stderr, exit code, and elapsed time without a shell', async () => {
    const result = await runCommand(spec("console.log('out'); console.error('err')"));
    expect(result.exitCode).toBe(0);
    expect(result.signal).toBeNull();
    expect(result.timedOut).toBe(false);
    expect(result.stdout).toBe('out\n');
    expect(result.stderr).toBe('err\n');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Run the focused test and confirm the missing export failure**

Run:

```bash
pnpm --filter @roadmap/command-runner test
```

Expected: FAIL because `../src/index.js` does not exist.

- [ ] **Step 4: Implement the shared types and a two-stage timeout runner**

```ts
// packages/command-runner/src/run-command.ts
import spawn from 'cross-spawn';

export interface CommandSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}

export interface CommandResult {
  command: CommandSpec;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

const FORCE_KILL_GRACE_MS = 500;

export async function runCommand(spec: CommandSpec): Promise<CommandResult> {
  const startedAt = performance.now();

  return await new Promise((resolve, reject) => {
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let closed = false;
    let forceKill: NodeJS.Timeout | undefined;

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKill = setTimeout(() => {
        if (!closed) child.kill('SIGKILL');
      }, FORCE_KILL_GRACE_MS);
    }, spec.timeoutMs);

    child.once('error', (error) => {
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      reject(error);
    });

    child.once('close', (exitCode, signal) => {
      closed = true;
      clearTimeout(timeout);
      if (forceKill) clearTimeout(forceKill);
      resolve({
        command: spec,
        exitCode,
        signal,
        timedOut,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
  });
}
```

- [ ] **Step 5: Add failure, literal-argument, missing-command, timeout, and forced-termination tests**

Append:

```ts
it('preserves a non-zero exit code', async () => {
  const result = await runCommand(spec('process.exit(7)'));
  expect(result.exitCode).toBe(7);
  expect(result.timedOut).toBe(false);
});

it('passes metacharacters as literal arguments rather than shell syntax', async () => {
  const result = await runCommand({
    command: nodeCommand,
    args: ['--input-type=module', '--eval', 'console.log(process.argv[1])', '&& echo injected'],
    cwd: process.cwd(),
    timeoutMs: 5_000,
  });
  expect(result.stdout).toBe('&& echo injected\n');
  expect(result.stderr).toBe('');
});

it('rejects when the executable cannot be started', async () => {
  await expect(
    runCommand({ command: 'roadmap-command-that-does-not-exist', args: [], cwd: process.cwd(), timeoutMs: 500 }),
  ).rejects.toThrow();
});

it('marks and terminates commands that exceed the timeout', async () => {
  const result = await runCommand(spec('setTimeout(() => {}, 10_000)', 50));
  expect(result.timedOut).toBe(true);
  expect(result.exitCode).not.toBe(0);
  expect(result.durationMs).toBeLessThan(2_000);
});

it('does not leave a child alive when it installs a SIGTERM handler', async () => {
  const source = `
    process.on('SIGTERM', () => {});
    setInterval(() => process.stdout.write('alive\\n'), 25);
  `;
  const result = await runCommand(spec(source, 50));
  expect(result.timedOut).toBe(true);
  expect(result.durationMs).toBeLessThan(2_000);
});
```

The last test is cross-platform: Unix exercises the grace-period escalation, while Windows may terminate on the first signal. Both environments must prove the process is gone before the promise resolves.

- [ ] **Step 6: Run package checks and commit**

Run:

```bash
pnpm --filter @roadmap/command-runner check
pnpm --filter @roadmap/command-runner test
```

Expected: PASS with six tests.

Commit:

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts packages/command-runner
git commit -m "feat: add shell-free command runner"
```

### Task 2: Define the exercise contract and safe path rules

**Files:**
- Create: `packages/exercise-contract/package.json`
- Create: `packages/exercise-contract/tsconfig.json`
- Create: `packages/exercise-contract/vitest.config.ts`
- Create: `packages/exercise-contract/src/schema.ts`
- Create: `packages/exercise-contract/src/paths.ts`
- Create: `packages/exercise-contract/src/types.ts`
- Create: `packages/exercise-contract/src/index.ts`
- Create: `packages/exercise-contract/test/schema.test.ts`
- Create: `packages/exercise-contract/test/paths.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `CommandSpec`, competency/artifact ID conventions, and `Diagnostic`
- Produces: `ExerciseDefinitionSchema`, `ExerciseDefinition`, `normalizeRelativePath`, `isSafeRelativePath`, and `matchesEditablePath`

- [ ] **Step 1: Add exact `picomatch` packages to the catalog and create the package manifest**

Run:

```bash
pnpm add -Dw --save-exact picomatch @types/picomatch
```

```json
{
  "name": "@roadmap/exercise-contract",
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
  "dependencies": {
    "@roadmap/command-runner": "workspace:*",
    "picomatch": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "@types/picomatch": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Write failing schema tests for a valid contract and forbidden shell strings**

```ts
// packages/exercise-contract/test/schema.test.ts
import { describe, expect, it } from 'vitest';
import { ExerciseDefinitionSchema } from '../src/index.js';

const validExercise = {
  schemaVersion: 1,
  id: 'ex-js-closure-counter',
  version: '1.0.0',
  title: 'Xây bộ đếm có trạng thái riêng',
  type: 'focused-exercise',
  language: 'javascript',
  competencies: ['js.scope.lexical', 'js.function.closure'],
  requiredLevel: {
    'js.scope.lexical': 'implement',
    'js.function.closure': 'implement',
  },
  prerequisites: ['js.function.values'],
  commands: {
    baseline: [{ id: 'infrastructure', required: true, command: 'pnpm', args: ['test:infrastructure'], cwd: '.', timeoutMs: 60_000 }],
    learner: [{ id: 'contract', required: true, command: 'pnpm', args: ['test'], cwd: '.', timeoutMs: 60_000 }],
  },
  constraints: {
    editablePaths: ['src/**'],
    forbiddenDependencies: [],
    forbiddenApis: ['globalThis'],
  },
  evidence: ['test-report', 'source-diff', 'explanation'],
  hints: [
    { level: 1, path: 'hints/01-concept.md' },
    { level: 2, path: 'hints/02-diagnostic.md' },
    { level: 3, path: 'hints/03-structure.md' },
  ],
};

describe('ExerciseDefinitionSchema', () => {
  it('accepts an argv-based focused exercise contract', () => {
    expect(ExerciseDefinitionSchema.parse(validExercise)).toEqual(validExercise);
  });

  it('rejects a shell command string in place of argv metadata', () => {
    const invalid = structuredClone(validExercise) as Record<string, unknown>;
    invalid.commands = { learner: ['pnpm test && rm -rf .'] };
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
  });

  it('requires increasing, unique progressive hint levels', () => {
    const invalid = structuredClone(validExercise);
    invalid.hints = [
      { level: 1, path: 'hints/a.md' },
      { level: 1, path: 'hints/b.md' },
    ];
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
  });


  it('rejects command working directories and hint paths that escape the exercise root', () => {
    const invalidCommand = structuredClone(validExercise);
    invalidCommand.commands.learner[0]!.cwd = '../outside';
    expect(() => ExerciseDefinitionSchema.parse(invalidCommand)).toThrow();

    const invalidHint = structuredClone(validExercise);
    invalidHint.hints[0]!.path = '../../answer.md';
    expect(() => ExerciseDefinitionSchema.parse(invalidHint)).toThrow();
  });
});
```

- [ ] **Step 3: Write failing traversal and editable-path tests**

```ts
// packages/exercise-contract/test/paths.test.ts
import { describe, expect, it } from 'vitest';
import { isSafeRelativePath, matchesEditablePath, normalizeRelativePath } from '../src/index.js';

describe('exercise path rules', () => {
  it.each(['src/counter.js', 'src\\counter.js'])('normalizes %s to POSIX form', (input) => {
    expect(normalizeRelativePath(input)).toBe('src/counter.js');
  });

  it.each(['../secret', '/absolute', 'C:\\secret', 'src/../../secret', ''])('rejects unsafe relative path %s', (input) => {
    expect(isSafeRelativePath(input)).toBe(false);
  });

  it('matches editable globs after normalization', () => {
    expect(matchesEditablePath('src\\counter.js', ['src/**'])).toBe(true);
    expect(matchesEditablePath('test/counter.test.js', ['src/**'])).toBe(false);
  });
});
```

- [ ] **Step 4: Run tests and confirm the package is absent**

Run:

```bash
pnpm --filter @roadmap/exercise-contract test
```

Expected: FAIL because the source modules do not exist.

- [ ] **Step 5: Implement the Zod contract**

```ts
// packages/exercise-contract/src/schema.ts
import { z } from 'zod';
import { isSafeRelativePath } from './paths.js';

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const CompetencyIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/);
const ExerciseIdSchema = z.string().regex(/^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const RelativePathSchema = z.string().min(1).refine(isSafeRelativePath, 'Path must stay within the exercise root');

export const MasteryLevelSchema = z.enum(['recognize', 'explain', 'implement', 'diagnose', 'design-and-justify']);

export const CommandDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  required: z.boolean(),
  command: z.string().min(1),
  args: z.array(z.string()),
  cwd: RelativePathSchema,
  timeoutMs: z.number().int().positive().max(15 * 60_000),
}).strict();

export const ExerciseDefinitionSchema = z.object({
  schemaVersion: z.literal(1),
  id: ExerciseIdSchema,
  version: SemverSchema,
  title: z.string().min(1),
  type: z.enum(['focused-exercise', 'mechanism-lab', 'debugging-task', 'refactoring-task', 'change-request']),
  language: z.enum(['javascript', 'typescript', 'html-css', 'sql', 'mixed']),
  competencies: z.array(CompetencyIdSchema).min(1),
  requiredLevel: z.record(CompetencyIdSchema, MasteryLevelSchema),
  prerequisites: z.array(CompetencyIdSchema),
  commands: z.object({
    baseline: z.array(CommandDefinitionSchema).min(1),
    learner: z.array(CommandDefinitionSchema).min(1),
  }).strict(),
  constraints: z.object({
    editablePaths: z.array(RelativePathSchema).min(1),
    forbiddenDependencies: z.array(z.string()),
    forbiddenApis: z.array(z.string()),
  }).strict(),
  evidence: z.array(z.enum(['test-report', 'source-diff', 'explanation', 'observation-report', 'debugging-report'])).min(1),
  hints: z.array(z.object({
    level: z.number().int().min(1).max(5),
    path: RelativePathSchema,
  }).strict()).superRefine((hints, context) => {
    const levels = hints.map((hint) => hint.level);
    if (new Set(levels).size !== levels.length || levels.some((level, index) => index > 0 && level <= levels[index - 1]!)) {
      context.addIssue({ code: 'custom', message: 'Hint levels must be unique and strictly increasing' });
    }
  }),
}).strict().superRefine((definition, context) => {
  for (const competency of Object.keys(definition.requiredLevel)) {
    if (!definition.competencies.includes(competency)) {
      context.addIssue({ code: 'custom', path: ['requiredLevel', competency], message: 'Required level must reference a declared competency' });
    }
  }
});
```

```ts
// packages/exercise-contract/src/types.ts
import type { z } from 'zod';
import type { ExerciseDefinitionSchema } from './schema.js';

export type ExerciseDefinition = z.infer<typeof ExerciseDefinitionSchema>;
export type ExerciseCommandDefinition = ExerciseDefinition['commands']['baseline'][number];
```

- [ ] **Step 6: Implement cross-platform path safety**

```ts
// packages/exercise-contract/src/paths.ts
import path from 'node:path';
import picomatch from 'picomatch';

export function normalizeRelativePath(input: string): string {
  return input.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function isSafeRelativePath(input: string): boolean {
  if (input.length === 0 || path.isAbsolute(input) || /^[A-Za-z]:[\\/]/.test(input)) return false;
  const normalized = normalizeRelativePath(input);
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) return false;
  return normalized !== '.';
}

export function matchesEditablePath(candidate: string, patterns: readonly string[]): boolean {
  if (!isSafeRelativePath(candidate)) return false;
  const normalized = normalizeRelativePath(candidate);
  return patterns.some((pattern) => isSafeRelativePath(pattern) && picomatch(pattern, { dot: true })(normalized));
}
```

```ts
// packages/exercise-contract/src/index.ts
export * from './paths.js';
export * from './schema.js';
export * from './types.js';
```

- [ ] **Step 7: Run package verification and commit**

Run:

```bash
pnpm --filter @roadmap/exercise-contract check
pnpm --filter @roadmap/exercise-contract test
```

Expected: PASS with all schema and path cases.

Commit:

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml vitest.config.ts packages/exercise-contract
git commit -m "feat: define safe exercise contracts"
```

### Task 3: Load, materialize, and reopen learner workspaces without solutions

**Files:**
- Create: `packages/exercise-runner/package.json`
- Create: `packages/exercise-runner/tsconfig.json`
- Create: `packages/exercise-runner/vitest.config.ts`
- Create: `packages/exercise-runner/src/load-exercise.ts`
- Create: `packages/exercise-runner/src/materialize.ts`
- Create: `packages/exercise-runner/src/open-workspace.ts`
- Create: `packages/exercise-runner/src/baseline-manifest.ts`
- Create: `packages/exercise-runner/src/index.ts`
- Create: `packages/exercise-runner/test/materialize.test.ts`
- Create: `packages/exercise-runner/test/open-workspace.test.ts`
- Create: `fixtures/exercises/valid/minimal/**`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `ExerciseDefinitionSchema`, safe path helpers, `ValidationOutcome<T>`, and YAML parsing selected in WP-02
- Produces: `loadExercise(sourceRoot)`, `materializeExercise(sourceRoot, outputRoot)`, `openExerciseWorkspace(sourceRoot, outputRoot)`, `ExerciseWorkspace`, and baseline-manifest helpers

- [ ] **Step 1: Create the package manifest and failing materialization tests**

```json
{
  "name": "@roadmap/exercise-runner",
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
  "dependencies": {
    "@roadmap/command-runner": "workspace:*",
    "@roadmap/exercise-contract": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "yaml": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/exercise-runner/test/materialize.test.ts
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('materializeExercise', () => {
  it('copies starter and open tests, excludes solutions, and writes a baseline manifest', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-'));
    const result = await materializeExercise(fixture, output);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toContain('createCounter');
    expect(await readFile(path.join(output, 'test/open/counter.contract.test.js'), 'utf8')).toContain(
      'independent',
    );
    await expect(stat(path.join(output, 'solution'))).rejects.toThrow();
    await expect(stat(path.join(output, 'hints'))).rejects.toThrow();

    const manifest = JSON.parse(await readFile(result.value.baselineManifestPath, 'utf8'));
    expect(manifest.exerciseId).toBe('ex-js-closure-counter');
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toEqual(
      expect.arrayContaining(['src/counter.js', 'test/open/counter.contract.test.js']),
    );
  });
});
```

```ts
// packages/exercise-runner/test/open-workspace.test.ts
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise, openExerciseWorkspace } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('openExerciseWorkspace', () => {
  it('reuses a matching workspace without replacing learner edits', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-open-'));
    const created = await materializeExercise(fixture, output);
    if (!created.ok) throw new Error('Fixture must materialize');

    const learnerSource = 'export const learnerChange = true;\n';
    await writeFile(path.join(output, 'src/counter.js'), learnerSource);
    const reopened = await openExerciseWorkspace(fixture, output);

    expect(reopened.ok).toBe(true);
    expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toBe(learnerSource);
  });

  it('fails closed on an existing workspace from another exercise version', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-mismatch-'));
    const created = await materializeExercise(fixture, output);
    if (!created.ok) throw new Error('Fixture must materialize');

    const manifest = JSON.parse(await readFile(created.value.baselineManifestPath, 'utf8'));
    manifest.exerciseVersion = '9.9.9';
    await writeFile(created.value.baselineManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const reopened = await openExerciseWorkspace(fixture, output);
    expect(reopened.ok).toBe(false);
    if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_WORKSPACE_001');
  });
});
```

- [ ] **Step 2: Create a minimal valid fixture and confirm the tests fail**

Create `fixtures/exercises/valid/minimal/exercise.yaml` from the valid Task 2 metadata and add:

```js
// fixtures/exercises/valid/minimal/starter/src/counter.js
export function createCounter() {
  throw new Error('Learner implementation required');
}
```

```json
// fixtures/exercises/valid/minimal/starter/package.json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test:infrastructure": "node --test test/infrastructure.test.js",
    "test": "node --test"
  }
}
```

```js
// fixtures/exercises/valid/minimal/tests/open/counter.contract.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../../src/counter.js';

test('counter instances preserve independent state', () => {
  const first = createCounter();
  const second = createCounter();
  assert.equal(first(), 1);
  assert.equal(first(), 2);
  assert.equal(second(), 1);
});
```

```js
// fixtures/exercises/valid/minimal/solution/src/counter.js
export function createCounter() {
  let value = 0;
  return () => ++value;
}
```

Run:

```bash
pnpm --filter @roadmap/exercise-runner test -- materialize.test.ts open-workspace.test.ts
```

Expected: FAIL because the runner exports do not exist.

- [ ] **Step 3: Implement exercise loading with structured YAML failures**

```ts
// packages/exercise-runner/src/load-exercise.ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExerciseDefinitionSchema, type ExerciseDefinition } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { parse } from 'yaml';

export function resolveExerciseRoot(sourceRoot: string | URL): string {
  return sourceRoot instanceof URL ? fileURLToPath(sourceRoot) : path.resolve(sourceRoot);
}

export async function loadExercise(
  sourceRoot: string | URL,
): Promise<ValidationOutcome<ExerciseDefinition>> {
  const root = resolveExerciseRoot(sourceRoot);
  const file = path.join(root, 'exercise.yaml');
  try {
    const text = await readFile(file, 'utf8');
    const parsed = ExerciseDefinitionSchema.safeParse(parse(text));
    if (!parsed.success) {
      return failure(parsed.error.issues.map((issue) => ({
        code: 'EXERCISE_SCHEMA_001',
        severity: 'error' as const,
        location: { file, pointer: `/${issue.path.join('/')}` },
        observed: issue.input,
        expected: 'Exercise metadata conforming to schema version 1',
        reason: issue.message,
        remediation: 'Correct exercise.yaml at the reported pointer',
        documentation: 'docs/authoring/exercises.md',
      })));
    }
    return success(parsed.data);
  } catch (error) {
    return failure([{
      code: 'EXERCISE_LOAD_001',
      severity: 'error',
      location: { file },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'Readable UTF-8 YAML exercise metadata',
      reason: 'The exercise contract could not be loaded',
      remediation: 'Restore exercise.yaml and ensure it is readable YAML',
      documentation: 'docs/authoring/exercises.md',
    }]);
  }
}
```

- [ ] **Step 4: Implement deterministic baseline-manifest helpers**

```ts
// packages/exercise-runner/src/baseline-manifest.ts
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

export interface BaselineFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ExerciseBaselineManifest {
  schemaVersion: 1;
  exerciseId: string;
  exerciseVersion: string;
  files: readonly BaselineFileRecord[];
}

export async function hashFile(file: string, relativePath: string): Promise<BaselineFileRecord> {
  const bytes = await readFile(file);
  return {
    path: relativePath,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

export async function writeBaselineManifest(
  file: string,
  manifest: ExerciseBaselineManifest,
): Promise<void> {
  await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

export async function readBaselineManifest(file: string): Promise<ExerciseBaselineManifest> {
  const value: unknown = JSON.parse(await readFile(file, 'utf8'));
  if (
    typeof value !== 'object' || value === null ||
    !('schemaVersion' in value) || value.schemaVersion !== 1 ||
    !('exerciseId' in value) || typeof value.exerciseId !== 'string' ||
    !('exerciseVersion' in value) || typeof value.exerciseVersion !== 'string' ||
    !('files' in value) || !Array.isArray(value.files)
  ) {
    throw new Error('Invalid exercise baseline manifest');
  }
  return value as ExerciseBaselineManifest;
}
```

- [ ] **Step 5: Implement allowlisted materialization and non-destructive workspace reopening**

```ts
// packages/exercise-runner/src/materialize.ts
import { cp, mkdir, readdir, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRelativePath } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { hashFile, writeBaselineManifest } from './baseline-manifest.js';
import { loadExercise, resolveExerciseRoot } from './load-exercise.js';

export interface ExerciseWorkspace {
  exerciseId: string;
  root: string;
  baselineManifestPath: string;
}

async function listRegularFiles(root: string, current = root): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${absolute}`);
    if (entry.isDirectory()) output.push(...await listRegularFiles(root, absolute));
    if (entry.isFile()) output.push(normalizeRelativePath(path.relative(root, absolute)));
  }
  return output.sort();
}

function pathFailure(location: string, error: unknown): ValidationOutcome<never> {
  return failure([{
    code: 'EXERCISE_PATH_001',
    severity: 'error',
    location: { file: location },
    observed: error instanceof Error ? error.message : String(error),
    expected: 'Regular files under starter/ and tests/open/ with no symlinks or traversal',
    reason: 'Exercise publication input contains an unsafe or unreadable path',
    remediation: 'Remove symlinks and restore the required starter and open-test directories',
    documentation: 'docs/authoring/exercises.md',
  }]);
}

export async function materializeExercise(
  sourceRootInput: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const loaded = await loadExercise(sourceRootInput);
  if (!loaded.ok) return loaded;

  const sourceRoot = await realpath(resolveExerciseRoot(sourceRootInput));
  const starterRoot = path.join(sourceRoot, 'starter');
  const openTestsRoot = path.join(sourceRoot, 'tests', 'open');
  const resolvedOutput = path.resolve(outputRoot);
  if (resolvedOutput === sourceRoot || resolvedOutput.startsWith(`${sourceRoot}${path.sep}`)) {
    return failure([{
      code: 'EXERCISE_OUTPUT_001',
      severity: 'error',
      location: { file: resolvedOutput },
      observed: resolvedOutput,
      expected: 'An output directory outside the exercise source',
      reason: 'Materialization would overwrite source files',
      remediation: 'Choose a fresh temporary or learner workspace directory',
      documentation: 'docs/authoring/exercises.md',
    }]);
  }

  try {
    await listRegularFiles(starterRoot);
    await listRegularFiles(openTestsRoot);
    await rm(resolvedOutput, { recursive: true, force: true });
    await mkdir(resolvedOutput, { recursive: true });
    await cp(starterRoot, resolvedOutput, { recursive: true, dereference: false });
    await cp(openTestsRoot, path.join(resolvedOutput, 'test', 'open'), {
      recursive: true,
      dereference: false,
    });

    const files = await listRegularFiles(resolvedOutput);
    const records = await Promise.all(
      files.map((file) => hashFile(path.join(resolvedOutput, file), file)),
    );
    const metadataRoot = path.join(resolvedOutput, '.roadmap');
    await mkdir(metadataRoot, { recursive: true });
    const baselineManifestPath = path.join(metadataRoot, 'exercise-baseline.json');
    await writeBaselineManifest(baselineManifestPath, {
      schemaVersion: 1,
      exerciseId: loaded.value.id,
      exerciseVersion: loaded.value.version,
      files: records,
    });
    return success({ exerciseId: loaded.value.id, root: resolvedOutput, baselineManifestPath });
  } catch (error) {
    return pathFailure(sourceRoot, error);
  }
}
```

```ts
// packages/exercise-runner/src/open-workspace.ts
import { access } from 'node:fs/promises';
import path from 'node:path';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { readBaselineManifest } from './baseline-manifest.js';
import { loadExercise } from './load-exercise.js';
import { materializeExercise, type ExerciseWorkspace } from './materialize.js';

export async function openExerciseWorkspace(
  sourceRoot: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const definition = await loadExercise(sourceRoot);
  if (!definition.ok) return definition;

  const root = path.resolve(outputRoot);
  const baselineManifestPath = path.join(root, '.roadmap', 'exercise-baseline.json');
  try {
    await access(baselineManifestPath);
  } catch {
    return materializeExercise(sourceRoot, root);
  }

  try {
    const baseline = await readBaselineManifest(baselineManifestPath);
    if (
      baseline.exerciseId !== definition.value.id ||
      baseline.exerciseVersion !== definition.value.version
    ) {
      return failure([{
        code: 'EXERCISE_WORKSPACE_001',
        severity: 'error',
        location: { file: baselineManifestPath },
        observed: `${baseline.exerciseId}@${baseline.exerciseVersion}`,
        expected: `${definition.value.id}@${definition.value.version}`,
        reason: 'The existing learner workspace belongs to a different exercise contract',
        remediation: 'Choose another workspace or explicitly remove the existing directory',
        documentation: 'docs/learner/exercise-workflow.md',
      }]);
    }
    return success({ exerciseId: definition.value.id, root, baselineManifestPath });
  } catch (error) {
    return failure([{
      code: 'EXERCISE_WORKSPACE_002',
      severity: 'error',
      location: { file: baselineManifestPath },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'A readable versioned exercise baseline manifest',
      reason: 'The existing learner workspace metadata is invalid',
      remediation: 'Recover the workspace metadata or move learner files before recreating the workspace',
      documentation: 'docs/learner/exercise-workflow.md',
    }]);
  }
}
```

- [ ] **Step 6: Prove symlink rejection on Windows and Unix**

Append to `materialize.test.ts`:

```ts
import { cp, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

it('returns EXERCISE_PATH_001 for a selected source symlink', async () => {
  const source = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-source-'));
  await cp(fileURLToPath(fixture), source, { recursive: true });

  if (process.platform === 'win32') {
    await symlink(
      path.join(source, 'solution', 'src'),
      path.join(source, 'starter', 'src', 'answer-directory'),
      'junction',
    );
  } else {
    await symlink(
      path.join(source, 'solution', 'src', 'counter.js'),
      path.join(source, 'starter', 'src', 'answer.js'),
      'file',
    );
  }

  const output = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-output-'));
  const result = await materializeExercise(source, output);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
});
```

The Windows branch uses a directory junction, which does not require silently skipping the test when file-symlink privileges are unavailable.

- [ ] **Step 7: Export the package, run tests, and commit**

```ts
// packages/exercise-runner/src/index.ts
export * from './baseline-manifest.js';
export * from './load-exercise.js';
export * from './materialize.js';
export * from './open-workspace.js';
```

Run:

```bash
pnpm --filter @roadmap/exercise-runner check
pnpm --filter @roadmap/exercise-runner test
```

Commit:

```bash
git add vitest.config.ts packages/exercise-runner fixtures/exercises
git commit -m "feat: materialize persistent exercise workspaces"
```


### Task 4: Protect learner workspaces and execute baseline or learner command sets

**Files:**
- Create: `packages/exercise-runner/src/verify-editable-paths.ts`
- Create: `packages/exercise-runner/src/verify-exercise.ts`
- Create: `packages/exercise-runner/test/verify-editable-paths.test.ts`
- Create: `packages/exercise-runner/test/verify-exercise.test.ts`
- Modify: `packages/exercise-runner/src/index.ts`

**Interfaces:**
- Consumes: persistent workspace, exercise definition, baseline manifest, `runCommand`, and editable globs
- Produces: `verifyEditablePaths`, `verifyExercise`, `VerificationMode`, and `ExerciseVerificationReport`

- [ ] **Step 1: Write failing tests for allowed changes, protected tests, and injected symlinks**

```ts
// packages/exercise-runner/test/verify-editable-paths.test.ts
import { mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeExercise, verifyEditablePaths } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('verifyEditablePaths', () => {
  it('allows changes under src/** and rejects changes to open tests', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-'));
    const materialized = await materializeExercise(fixture, output);
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;

    await writeFile(path.join(output, 'src/counter.js'), 'export const changed = true;\n');
    expect((await verifyEditablePaths(materialized.value, ['src/**'])).ok).toBe(true);

    const testFile = path.join(output, 'test/open/counter.contract.test.js');
    await writeFile(testFile, `${await readFile(testFile, 'utf8')}\n// modified\n`);
    const rejected = await verifyEditablePaths(materialized.value, ['src/**']);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
  });

  it('rejects a symlink added after materialization', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-link-'));
    const materialized = await materializeExercise(fixture, output);
    if (!materialized.ok) throw new Error('Fixture must materialize');

    if (process.platform === 'win32') {
      await symlink(path.join(output, 'src'), path.join(output, 'linked-src'), 'junction');
    } else {
      await symlink(path.join(output, 'src/counter.js'), path.join(output, 'answer.js'), 'file');
    }

    const result = await verifyEditablePaths(materialized.value, ['src/**']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
  });
});
```

- [ ] **Step 2: Implement baseline diffing with fail-closed symlink handling**

```ts
// packages/exercise-runner/src/verify-editable-paths.ts
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { matchesEditablePath, normalizeRelativePath } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { readBaselineManifest } from './baseline-manifest.js';
import type { ExerciseWorkspace } from './materialize.js';

async function listWorkspaceFiles(root: string, current = root): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    if (entry.name === '.roadmap') continue;
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${absolute}`);
    if (entry.isDirectory()) output.push(...await listWorkspaceFiles(root, absolute));
    if (entry.isFile()) output.push(normalizeRelativePath(path.relative(root, absolute)));
  }
  return output.sort();
}

export async function verifyEditablePaths(
  workspace: ExerciseWorkspace,
  editablePaths: readonly string[],
): Promise<ValidationOutcome<readonly string[]>> {
  try {
    const baseline = await readBaselineManifest(workspace.baselineManifestPath);
    const baselineByPath = new Map(baseline.files.map((file) => [file.path, file.sha256]));
    const currentPaths = await listWorkspaceFiles(workspace.root);
    const allPaths = [...new Set([...baselineByPath.keys(), ...currentPaths])].sort();
    const changed: string[] = [];

    for (const relativePath of allPaths) {
      let currentHash: string | undefined;
      try {
        const bytes = await readFile(path.join(workspace.root, relativePath));
        currentHash = createHash('sha256').update(bytes).digest('hex');
      } catch {
        currentHash = undefined;
      }
      if (currentHash !== baselineByPath.get(relativePath)) changed.push(relativePath);
    }

    const forbidden = changed.filter((candidate) => !matchesEditablePath(candidate, editablePaths));
    if (forbidden.length > 0) {
      return failure(forbidden.map((candidate) => ({
        code: 'EXERCISE_EDITABLE_001',
        severity: 'error' as const,
        location: { file: candidate },
        observed: candidate,
        expected: `A changed path matching one of: ${editablePaths.join(', ')}`,
        reason: 'The learner modified or deleted a protected path',
        remediation: 'Restore the protected file and place implementation changes in an editable path',
        documentation: 'docs/learner/exercise-workflow.md',
      })));
    }
    return success(changed);
  } catch (error) {
    return failure([{
      code: 'EXERCISE_EDITABLE_002',
      severity: 'error',
      location: { file: workspace.root },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'A regular-file workspace with readable baseline metadata',
      reason: 'Protected-path verification could not safely enumerate the workspace',
      remediation: 'Remove symlinks and repair the .roadmap baseline manifest before retrying',
      documentation: 'docs/learner/exercise-workflow.md',
    }]);
  }
}
```

- [ ] **Step 3: Write failing baseline-versus-learner verification tests**

```ts
// packages/exercise-runner/test/verify-exercise.test.ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExercise, materializeExercise, verifyExercise } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('verifyExercise', () => {
  it('passes baseline infrastructure while learner verification remains failed', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-verify-'));
    const definition = await loadExercise(fixture);
    const workspace = await materializeExercise(fixture, output);
    expect(definition.ok && workspace.ok).toBe(true);
    if (!definition.ok || !workspace.ok) return;

    const baseline = await verifyExercise(definition.value, workspace.value, 'baseline');
    const learner = await verifyExercise(definition.value, workspace.value, 'learner');
    expect(baseline.status).toBe('passed');
    expect(learner.status).toBe('failed');
  });

  it('does not execute commands after a protected test is changed', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-protected-'));
    const definition = await loadExercise(fixture);
    const workspace = await materializeExercise(fixture, output);
    if (!definition.ok || !workspace.ok) throw new Error('Fixture must load');

    await writeFile(path.join(output, 'test/open/counter.contract.test.js'), '// removed\n');
    const report = await verifyExercise(definition.value, workspace.value, 'learner');
    expect(report.status).toBe('failed');
    expect(report.steps).toHaveLength(0);
    expect(report.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
  });
});
```

- [ ] **Step 4: Implement protected-path verification, contained working directories, and command composition**

```ts
// packages/exercise-runner/src/verify-exercise.ts
import path from 'node:path';
import type { CommandResult } from '@roadmap/command-runner';
import { runCommand } from '@roadmap/command-runner';
import type { ExerciseDefinition } from '@roadmap/exercise-contract';
import type { Diagnostic } from '@roadmap/validation-core';
import type { ExerciseWorkspace } from './materialize.js';
import { verifyEditablePaths } from './verify-editable-paths.js';

export type VerificationMode = 'baseline' | 'learner';

export interface VerificationStepResult {
  id: string;
  required: boolean;
  command: CommandResult;
}

export interface ExerciseVerificationReport {
  exerciseId: string;
  mode: VerificationMode;
  status: 'passed' | 'failed' | 'internal-error';
  steps: readonly VerificationStepResult[];
  diagnostics: readonly Diagnostic[];
}

function resolveWorkspaceDirectory(root: string, relative: string): string {
  const resolved = path.resolve(root, relative);
  const relationship = path.relative(root, resolved);
  if (relationship === '..' || relationship.startsWith(`..${path.sep}`) || path.isAbsolute(relationship)) {
    throw new Error(`Command working directory escapes workspace: ${relative}`);
  }
  return resolved;
}

export async function verifyExercise(
  definition: ExerciseDefinition,
  workspace: ExerciseWorkspace,
  mode: VerificationMode,
): Promise<ExerciseVerificationReport> {
  const steps: VerificationStepResult[] = [];
  const diagnostics: Diagnostic[] = [];
  try {
    const protectedPaths = await verifyEditablePaths(
      workspace,
      definition.constraints.editablePaths,
    );
    if (!protectedPaths.ok) {
      return {
        exerciseId: definition.id,
        mode,
        status: 'failed',
        steps,
        diagnostics: protectedPaths.diagnostics,
      };
    }

    for (const step of definition.commands[mode]) {
      const command = await runCommand({
        command: step.command,
        args: step.args,
        cwd: resolveWorkspaceDirectory(workspace.root, step.cwd),
        timeoutMs: step.timeoutMs,
      });
      steps.push({ id: step.id, required: step.required, command });
      if (step.required && (command.exitCode !== 0 || command.timedOut)) {
        diagnostics.push({
          code: command.timedOut ? 'EXERCISE_COMMAND_002' : 'EXERCISE_COMMAND_001',
          severity: 'error',
          location: { file: workspace.root, pointer: `/commands/${mode}/${step.id}` },
          observed: { exitCode: command.exitCode, timedOut: command.timedOut, stderr: command.stderr },
          expected: 'Required verification command exits 0 within its timeout',
          reason: command.timedOut ? 'The verification command timed out' : 'The verification command failed',
          remediation: `Run ${step.command} ${step.args.join(' ')} in the learner workspace and fix the reported failure`,
          documentation: 'docs/learner/exercise-workflow.md',
        });
        break;
      }
    }
    return {
      exerciseId: definition.id,
      mode,
      status: diagnostics.length === 0 ? 'passed' : 'failed',
      steps,
      diagnostics,
    };
  } catch (error) {
    return {
      exerciseId: definition.id,
      mode,
      status: 'internal-error',
      steps,
      diagnostics: [{
        code: 'EXERCISE_INTERNAL_001',
        severity: 'error',
        location: { file: workspace.root },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'Verifier completes normally within the learner workspace',
        reason: 'The exercise verifier crashed',
        remediation: 'Report the verifier crash with the exercise and template versions',
        documentation: 'docs/maintainers/verifier-failures.md',
      }],
    };
  }
}
```

- [ ] **Step 5: Export, verify, and commit**

Add these exports to `packages/exercise-runner/src/index.ts`:

```ts
export * from './verify-editable-paths.js';
export * from './verify-exercise.js';
```

Run:

```bash
pnpm --filter @roadmap/exercise-runner check
pnpm --filter @roadmap/exercise-runner test
```

Commit:

```bash
git add packages/exercise-runner
git commit -m "feat: verify protected exercise workspaces"
```


### Task 5: Add a real progressive-disclosure JavaScript exercise and non-destructive CLI

**Files:**
- Create: `exercises/javascript/ex-js-closure-counter/**`
- Create: `tooling/verify-exercise/package.json`
- Create: `tooling/verify-exercise/tsconfig.json`
- Create: `tooling/verify-exercise/vitest.config.ts`
- Create: `tooling/verify-exercise/src/main.ts`
- Create: `tooling/verify-exercise/test/cli.test.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: exercise loader, persistent workspace opener, verifier, and progressive-hint contract
- Produces: `pnpm exercise:verify -- <exercise-root> <workspace> <baseline|learner>` without replacing existing learner files

- [ ] **Step 1: Author the real exercise contract**

Create `exercise.yaml` with:

```yaml
schemaVersion: 1
id: ex-js-closure-counter
version: 1.0.0
title: Xây bộ đếm có trạng thái riêng
type: focused-exercise
language: javascript
competencies:
  - js.scope.lexical
  - js.function.closure
requiredLevel:
  js.scope.lexical: implement
  js.function.closure: implement
prerequisites:
  - js.function.values
commands:
  baseline:
    - id: infrastructure
      required: true
      command: pnpm
      args: [test:infrastructure]
      cwd: .
      timeoutMs: 60000
  learner:
    - id: contract
      required: true
      command: pnpm
      args: [test]
      cwd: .
      timeoutMs: 60000
constraints:
  editablePaths: [src/**]
  forbiddenDependencies: []
  forbiddenApis: [globalThis]
evidence:
  - test-report
  - source-diff
  - explanation
hints:
  - level: 1
    path: hints/01-concept.md
  - level: 2
    path: hints/02-diagnostic.md
  - level: 3
    path: hints/03-structure.md
```

- [ ] **Step 2: Author starter infrastructure and open contract tests**

```json
// starter/package.json
{
  "private": true,
  "type": "module",
  "scripts": {
    "test:infrastructure": "node --test test/infrastructure.test.js",
    "test": "node --test"
  }
}
```

```js
// starter/src/counter.js
export function createCounter() {
  throw new Error('Implement createCounter');
}
```

```js
// starter/test/infrastructure.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../src/counter.js';

test('starter exports createCounter', () => {
  assert.equal(typeof createCounter, 'function');
});
```

```js
// tests/open/counter.contract.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../../src/counter.js';

test('each counter preserves independent private state', () => {
  const first = createCounter();
  const second = createCounter();
  for (let expected = 1; expected <= 10; expected += 1) {
    assert.equal(first(), expected);
  }
  assert.equal(second(), 1);
});
```

The materializer copies this open test to `test/open/counter.contract.test.js`. It remains protected by the baseline manifest and fails for the intended missing implementation.

- [ ] **Step 3: Author three genuinely progressive hints**

`hints/01-concept.md`:

```markdown
# Gợi ý 1: Khái niệm

Biến trạng thái phải thuộc lexical environment được tạo riêng mỗi lần gọi `createCounter`, không thuộc global scope.
```

`hints/02-diagnostic.md`:

```markdown
# Gợi ý 2: Chẩn đoán

Kiểm tra vị trí khai báo biến đếm. Nếu hai counter ảnh hưởng lẫn nhau, biến đang được chia sẻ ngoài lần gọi `createCounter`.
```

`hints/03-structure.md`:

```markdown
# Gợi ý 3: Cấu trúc

`createCounter` cần khai báo một biến cục bộ rồi trả về một function tăng và trả lại biến đó. Function trả về sẽ giữ lexical environment bằng closure.
```

- [ ] **Step 4: Add walkthrough and reference solution outside the starter**

```js
// solution/src/counter.js
export function createCounter() {
  let value = 0;
  return function next() {
    value += 1;
    return value;
  };
}
```

The walkthrough explains lexical environment, instance independence, why a global variable fails, and why the reference solution is not the only valid implementation.

- [ ] **Step 5: Write CLI integration tests for baseline output and workspace preservation**

```ts
// tooling/verify-exercise/test/cli.test.ts
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../../..');
const source = path.join(root, 'exercises/javascript/ex-js-closure-counter');

async function run(workspace: string, mode: 'baseline' | 'learner') {
  return execFileAsync(process.execPath, [
    '--import',
    'tsx',
    'tooling/verify-exercise/src/main.ts',
    source,
    workspace,
    mode,
    '--json',
  ], { cwd: root });
}

describe('verify-exercise CLI', () => {
  it('returns JSON and exit 0 for baseline verification', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'roadmap-cli-'));
    const { stdout } = await run(workspace, 'baseline');
    expect(JSON.parse(stdout).status).toBe('passed');
  });

  it('reopens rather than rematerializes an existing learner workspace', async () => {
    const workspace = await mkdtemp(path.join(tmpdir(), 'roadmap-cli-persist-'));
    await run(workspace, 'baseline');
    const learnerSource = 'export function createCounter() { return () => 99; }\n';
    await writeFile(path.join(workspace, 'src/counter.js'), learnerSource);

    await run(workspace, 'baseline');
    expect(await readFile(path.join(workspace, 'src/counter.js'), 'utf8')).toBe(learnerSource);
  });
});
```

- [ ] **Step 6: Implement the CLI without shell interpolation or destructive rematerialization**

```ts
// tooling/verify-exercise/src/main.ts
import { resolve } from 'node:path';
import { loadExercise, openExerciseWorkspace, verifyExercise } from '@roadmap/exercise-runner';

const [sourceArg, workspaceArg, modeArg, formatArg] = process.argv.slice(2);
if (!sourceArg || !workspaceArg || (modeArg !== 'baseline' && modeArg !== 'learner')) {
  console.error('Usage: verify-exercise <exercise-root> <workspace> <baseline|learner> [--json]');
  process.exitCode = 2;
} else {
  const source = resolve(sourceArg);
  const workspaceRoot = resolve(workspaceArg);
  const definition = await loadExercise(source);
  const workspace = await openExerciseWorkspace(source, workspaceRoot);
  if (!definition.ok || !workspace.ok) {
    const diagnostics = [...definition.diagnostics, ...workspace.diagnostics];
    console.error(formatArg === '--json' ? JSON.stringify({ status: 'invalid', diagnostics }) : diagnostics);
    process.exitCode = 1;
  } else {
    const report = await verifyExercise(definition.value, workspace.value, modeArg);
    console.log(formatArg === '--json' ? JSON.stringify(report) : report);
    process.exitCode = report.status === 'passed' ? 0 : 1;
  }
}
```

- [ ] **Step 7: Wire the root script and prove baseline passes while learner mode fails**

```json
{
  "scripts": {
    "exercise:verify": "tsx tooling/verify-exercise/src/main.ts"
  }
}
```

Run from a clean `.tmp/exercise` path:

```bash
pnpm exercise:verify -- exercises/javascript/ex-js-closure-counter .tmp/exercise baseline --json
pnpm exercise:verify -- exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
```

Expected: baseline exits `0`; learner exits `1` with `EXERCISE_COMMAND_001` because the starter intentionally has no learner implementation.

- [ ] **Step 8: Install the reference source only in the temporary workspace and prove learner mode passes**

```bash
node --input-type=module --eval "import { copyFile } from 'node:fs/promises'; await copyFile('exercises/javascript/ex-js-closure-counter/solution/src/counter.js', '.tmp/exercise/src/counter.js')"
pnpm exercise:verify -- exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
```

Expected: exit `0`, status `passed`, and the CLI does not replace the copied implementation before verification.

Commit:

```bash
git add exercises/javascript/ex-js-closure-counter tooling/verify-exercise package.json vitest.config.ts
git commit -m "feat: add progressive closure exercise workflow"
```


### Task 6: Define criterion-based rubrics and evaluation

**Files:**
- Create: `packages/rubric-schema/package.json`
- Create: `packages/rubric-schema/tsconfig.json`
- Create: `packages/rubric-schema/vitest.config.ts`
- Create: `packages/rubric-schema/src/schema.ts`
- Create: `packages/rubric-schema/src/evaluate.ts`
- Create: `packages/rubric-schema/src/index.ts`
- Create: `packages/rubric-schema/test/rubric.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: stable criterion IDs and explicit evidence references
- Produces: `RubricSchema`, `Rubric`, `RubricSubmissionSchema`, `evaluateRubric`, and `RubricEvaluation`

- [ ] **Step 1: Write failing tests for critical, required, and missing criteria**

```ts
// packages/rubric-schema/test/rubric.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateRubric, RubricSchema } from '../src/index.js';

const rubric = RubricSchema.parse({
  schemaVersion: 1,
  id: 'rubric-js-closure-counter',
  version: '1.0.0',
  title: 'Closure counter rubric',
  criteria: [
    {
      id: 'closure.private-state',
      title: 'Private state',
      critical: true,
      required: true,
      competency: 'js.function.closure',
      evidence: ['source-diff', 'test-report'],
      levels: {
        '0': 'State is global or absent',
        '1': 'State is local but instances interfere',
        '2': 'Each counter has independent private state and negative tests',
        '3': 'Meets level 2 and clearly explains lexical environment lifetime',
      },
    },
    {
      id: 'documentation.explanation',
      title: 'Explanation',
      critical: false,
      required: true,
      competency: 'js.function.closure',
      evidence: ['explanation'],
      levels: {
        '0': 'Missing', '1': 'Describes code only', '2': 'Explains mechanism', '3': 'Explains trade-offs and counterexample',
      },
    },
  ],
});

describe('evaluateRubric', () => {
  it('fails when a critical criterion is below 2 regardless of another score', () => {
    const result = evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 1, 'documentation.explanation': 3 },
    });
    expect(result.status).toBe('needs-remediation');
    expect(result.blockingCriterionIds).toEqual(['closure.private-state']);
  });

  it('passes only when every required criterion is present and at least 2', () => {
    expect(evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: { 'closure.private-state': 2, 'documentation.explanation': 2 },
    }).status).toBe('passed');
  });


  it('rejects scores for criteria not declared by the rubric', () => {
    expect(() => evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      scores: {
        'closure.private-state': 2,
        'documentation.explanation': 2,
        'unknown.criterion': 3,
      },
    })).toThrow(/Unknown rubric criterion: unknown\.criterion/);
  });

  it('rejects a submission for another rubric version', () => {
    expect(() => evaluateRubric(rubric, {
      rubricId: rubric.id,
      rubricVersion: '9.9.9',
      scores: { 'closure.private-state': 2, 'documentation.explanation': 2 },
    })).toThrow(/expected rubric-js-closure-counter@1\.0\.0/);
  });
});
```

- [ ] **Step 2: Implement strict schemas**

```ts
// packages/rubric-schema/src/schema.ts
import { z } from 'zod';

const ScoreSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const CriterionIdSchema = z.string().regex(/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/);
const CompetencyIdSchema = z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/);

export const RubricSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^rubric-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(1),
  criteria: z.array(z.object({
    id: CriterionIdSchema,
    title: z.string().min(1),
    critical: z.boolean(),
    required: z.boolean(),
    competency: CompetencyIdSchema,
    evidence: z.array(z.string().min(1)).min(1),
    levels: z.object({
      '0': z.string().min(1),
      '1': z.string().min(1),
      '2': z.string().min(1),
      '3': z.string().min(1),
    }).strict(),
  }).strict()).min(1),
}).strict().superRefine((rubric, context) => {
  const ids = rubric.criteria.map((criterion) => criterion.id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['criteria'], message: 'Criterion IDs must be unique' });
});

export const RubricSubmissionSchema = z.object({
  rubricId: z.string(),
  rubricVersion: z.string(),
  scores: z.record(CriterionIdSchema, ScoreSchema),
}).strict();

export type Rubric = z.infer<typeof RubricSchema>;
export type RubricSubmission = z.infer<typeof RubricSubmissionSchema>;
export type RubricScore = z.infer<typeof ScoreSchema>;
```

- [ ] **Step 3: Implement evaluation without total-score shortcuts**

```ts
// packages/rubric-schema/src/evaluate.ts
import { RubricSubmissionSchema, type Rubric, type RubricScore, type RubricSubmission } from './schema.js';

export interface CriterionResult {
  criterionId: string;
  critical: boolean;
  required: boolean;
  score: RubricScore | null;
  status: 'passed' | 'failed' | 'missing';
}

export interface RubricEvaluation {
  status: 'passed' | 'needs-remediation';
  criteria: readonly CriterionResult[];
  blockingCriterionIds: readonly string[];
}

export function evaluateRubric(rubric: Rubric, submissionInput: RubricSubmission): RubricEvaluation {
  const submission = RubricSubmissionSchema.parse(submissionInput);
  if (submission.rubricId !== rubric.id || submission.rubricVersion !== rubric.version) {
    throw new Error(`Rubric submission targets ${submission.rubricId}@${submission.rubricVersion}, expected ${rubric.id}@${rubric.version}`);
  }

  const knownCriterionIds = new Set(rubric.criteria.map((criterion) => criterion.id));
  const unknownCriterionIds = Object.keys(submission.scores)
    .filter((criterionId) => !knownCriterionIds.has(criterionId))
    .sort();
  if (unknownCriterionIds.length > 0) {
    throw new Error(`Unknown rubric criterion: ${unknownCriterionIds.join(', ')}`);
  }

  const criteria = rubric.criteria.map((criterion): CriterionResult => {
    const score = submission.scores[criterion.id] ?? null;
    return {
      criterionId: criterion.id,
      critical: criterion.critical,
      required: criterion.required,
      score,
      status: score === null ? 'missing' : score >= 2 ? 'passed' : 'failed',
    };
  });
  const blockingCriterionIds = criteria
    .filter((criterion) => (criterion.required || criterion.critical) && criterion.status !== 'passed')
    .map((criterion) => criterion.criterionId);
  return {
    status: blockingCriterionIds.length === 0 ? 'passed' : 'needs-remediation',
    criteria,
    blockingCriterionIds,
  };
}
```

- [ ] **Step 4: Run the unknown-key and version-mismatch tests**

Run `pnpm --filter @roadmap/rubric-schema test -- rubric.test.ts` and require both explicit errors from Step 1.

- [ ] **Step 5: Export, verify, and commit**

```ts
// packages/rubric-schema/src/index.ts
export * from './evaluate.js';
export * from './schema.js';
```

Run:

```bash
pnpm --filter @roadmap/rubric-schema check
pnpm --filter @roadmap/rubric-schema test
```

Commit:

```bash
git add vitest.config.ts packages/rubric-schema
git commit -m "feat: evaluate critical rubric criteria"
```

### Task 7: Define versioned evidence with independent trust attestations

**Files:**
- Create: `packages/evidence-schema/package.json`
- Create: `packages/evidence-schema/tsconfig.json`
- Create: `packages/evidence-schema/vitest.config.ts`
- Create: `packages/evidence-schema/src/schema.ts`
- Create: `packages/evidence-schema/src/trust.ts`
- Create: `packages/evidence-schema/src/index.ts`
- Create: `packages/evidence-schema/test/evidence.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: curriculum, template, milestone, and immutable repository versions
- Produces: `EvidenceManifestSchema`, `EvidenceManifest`, `EvidenceTrustLevel`, `EvidenceAttestations`, and `satisfiesTrustRequirement`

- [ ] **Step 1: Create the package and write failing evidence tests**

```json
{
  "name": "@roadmap/evidence-schema",
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
  "dependencies": {
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/evidence-schema/test/evidence.test.ts
import { describe, expect, it } from 'vitest';
import { EvidenceManifestSchema, satisfiesTrustRequirement } from '../src/index.js';

const valid = {
  schemaVersion: 1,
  curriculumVersion: '0.1.0',
  templateVersion: '0.1.0',
  milestoneId: 'milestone-fullstack-vertical-slice',
  repository: {
    url: 'https://github.com/example/workshop-enrollment',
    commit: '0123456789abcdef0123456789abcdef01234567',
    attestations: ['repository-verifiable'],
  },
  verification: {
    ciRun: 'https://github.com/example/workshop-enrollment/actions/runs/123',
    status: 'passed',
    attestations: ['ci-verified'],
  },
  artifacts: [
    {
      id: 'architecture',
      path: 'evidence/architecture/overview.md',
      attestations: ['repository-verifiable'],
    },
  ],
};

describe('EvidenceManifestSchema', () => {
  it('accepts a versioned evidence manifest', () => {
    expect(EvidenceManifestSchema.parse(valid)).toEqual(valid);
  });

  it('rejects mutable branch names as repository commits', () => {
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      repository: { ...valid.repository, commit: 'main' },
    })).toThrow();
  });

  it('treats evidence attestations as independent capabilities, not a total order', () => {
    expect(satisfiesTrustRequirement(['self-reported'], 'ci-verified')).toBe(false);
    expect(satisfiesTrustRequirement(['human-reviewed'], 'ci-verified')).toBe(false);
    expect(satisfiesTrustRequirement(['externally-observable'], 'repository-verifiable')).toBe(false);
    expect(satisfiesTrustRequirement(['ci-verified', 'human-reviewed'], 'ci-verified')).toBe(true);
  });

  it('rejects a failed verification that claims ci-verified attestation', () => {
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      verification: { ...valid.verification, status: 'failed' },
    })).toThrow(/failed verification cannot claim ci-verified/);
  });

  it('rejects duplicate artifact IDs, traversal paths, insecure URLs, and duplicate attestations', () => {
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      artifacts: [valid.artifacts[0], valid.artifacts[0]],
    })).toThrow(/Artifact IDs must be unique/);
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      artifacts: [{ ...valid.artifacts[0], path: '../answer.md' }],
    })).toThrow();
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      repository: { ...valid.repository, url: 'http://example.com/repo' },
    })).toThrow();
    expect(() => EvidenceManifestSchema.parse({
      ...valid,
      repository: {
        ...valid.repository,
        attestations: ['repository-verifiable', 'repository-verifiable'],
      },
    })).toThrow(/Attestations must be unique/);
  });
});
```

- [ ] **Step 2: Implement independent trust-attestation semantics**

```ts
// packages/evidence-schema/src/trust.ts
export const evidenceTrustLevels = [
  'self-reported',
  'repository-verifiable',
  'ci-verified',
  'externally-observable',
  'human-reviewed',
] as const;

export type EvidenceTrustLevel = typeof evidenceTrustLevels[number];
export type EvidenceAttestations = readonly EvidenceTrustLevel[];

export function satisfiesTrustRequirement(
  actual: EvidenceAttestations,
  required: EvidenceTrustLevel,
): boolean {
  return actual.includes(required);
}
```

Do not add `compareTrustLevel`. Human review, CI execution, repository immutability, and external observability are different claims. One does not automatically prove another.

- [ ] **Step 3: Implement the strict manifest schema**

```ts
// packages/evidence-schema/src/schema.ts
import { z } from 'zod';
import { evidenceTrustLevels } from './trust.js';

const TrustSchema = z.enum(evidenceTrustLevels);
const AttestationsSchema = z.array(TrustSchema).min(1).superRefine((attestations, context) => {
  if (new Set(attestations).size !== attestations.length) {
    context.addIssue({ code: 'custom', message: 'Attestations must be unique' });
  }
});
const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
const UrlSchema = z.string().url().refine(
  (url) => url.startsWith('https://'),
  'Evidence URLs must use HTTPS',
);
const RelativeEvidencePathSchema = z.string().regex(
  /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$)).+$/,
  'Evidence paths must be repository-relative and cannot traverse',
);

export const EvidenceManifestSchema = z.object({
  schemaVersion: z.literal(1),
  curriculumVersion: SemverSchema,
  templateVersion: SemverSchema,
  milestoneId: z.string().regex(/^milestone-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  repository: z.object({
    url: UrlSchema,
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    attestations: AttestationsSchema,
  }).strict(),
  deployment: z.object({
    frontend: UrlSchema.optional(),
    api: UrlSchema.optional(),
    attestations: AttestationsSchema,
  }).strict().optional(),
  verification: z.object({
    ciRun: UrlSchema,
    status: z.enum(['passed', 'failed']),
    attestations: AttestationsSchema,
  }).strict(),
  artifacts: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    path: RelativeEvidencePathSchema,
    attestations: AttestationsSchema,
  }).strict()).min(1),
}).strict().superRefine((manifest, context) => {
  const artifactIds = manifest.artifacts.map((artifact) => artifact.id);
  if (new Set(artifactIds).size !== artifactIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['artifacts'],
      message: 'Artifact IDs must be unique',
    });
  }
  if (
    manifest.verification.status === 'failed' &&
    manifest.verification.attestations.includes('ci-verified')
  ) {
    context.addIssue({
      code: 'custom',
      path: ['verification', 'attestations'],
      message: 'A failed verification cannot claim ci-verified attestation',
    });
  }
});

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
```

- [ ] **Step 4: Export, verify, and commit**

```ts
// packages/evidence-schema/src/index.ts
export * from './schema.js';
export * from './trust.js';
```

Run:

```bash
pnpm --filter @roadmap/evidence-schema check
pnpm --filter @roadmap/evidence-schema test
```

Commit:

```bash
git add vitest.config.ts packages/evidence-schema
git commit -m "feat: validate independent evidence attestations"
```


### Task 8: Map failed rubric criteria to deterministic remediation

**Files:**
- Create: `packages/assessment-core/package.json`
- Create: `packages/assessment-core/tsconfig.json`
- Create: `packages/assessment-core/vitest.config.ts`
- Create: `packages/assessment-core/src/remediation.ts`
- Create: `packages/assessment-core/src/result.ts`
- Create: `packages/assessment-core/src/index.ts`
- Create: `packages/assessment-core/test/assessment.test.ts`
- Create: `fixtures/assessment/closure-counter-remediation.yaml`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: `RubricEvaluation`, competency IDs, and remediation metadata
- Produces: `RemediationCatalogSchema`, `createAssessmentResult`, and `AssessmentResult`

- [ ] **Step 1: Write the remediation fixture and failing test**

```yaml
# fixtures/assessment/closure-counter-remediation.yaml
schemaVersion: 1
entries:
  - criterion: closure.private-state
    competency: js.function.closure
    lessons:
      - lesson-js-closure-private-state
    exercises:
      - ex-js-closure-counter
    retake:
      - Restore independent state for each counter instance
      - Add the negative independence test
      - Update the technical explanation
```

```ts
// packages/assessment-core/test/assessment.test.ts
import { describe, expect, it } from 'vitest';
import { RubricSchema } from '@roadmap/rubric-schema';
import {
  createAssessmentResult,
  RemediationCatalogSchema,
  validateRemediationCoverage,
} from '../src/index.js';

const catalog = RemediationCatalogSchema.parse({
  schemaVersion: 1,
  entries: [{
    criterion: 'closure.private-state',
    competency: 'js.function.closure',
    lessons: ['lesson-js-closure-private-state'],
    exercises: ['ex-js-closure-counter'],
    retake: ['Restore independent state', 'Add negative test'],
  }],
});

describe('createAssessmentResult', () => {
  it('returns exact remediation for each blocking criterion', () => {
    const result = createAssessmentResult({
      status: 'needs-remediation',
      criteria: [{ criterionId: 'closure.private-state', critical: true, required: true, score: 1, status: 'failed' }],
      blockingCriterionIds: ['closure.private-state'],
    }, catalog);
    expect(result.status).toBe('needs-remediation');
    expect(result.blocking[0]?.competency).toBe('js.function.closure');
  });

  it('fails closed when a blocking criterion has no remediation entry', () => {
    expect(() => createAssessmentResult({
      status: 'needs-remediation',
      criteria: [{ criterionId: 'missing.entry', critical: true, required: true, score: 0, status: 'failed' }],
      blockingCriterionIds: ['missing.entry'],
    }, catalog)).toThrow(/No remediation entry/);
  });


  it('reports every required rubric criterion without remediation as an error', () => {
    const rubric = RubricSchema.parse({
      schemaVersion: 1,
      id: 'rubric-js-closure-counter',
      version: '1.0.0',
      title: 'Closure counter rubric',
      criteria: [{
        id: 'documentation.explanation',
        title: 'Explanation',
        critical: false,
        required: true,
        competency: 'js.function.closure',
        evidence: ['explanation'],
        levels: { '0': 'Missing', '1': 'Partial', '2': 'Meets', '3': 'Strong' },
      }],
    });
    const outcome = validateRemediationCoverage(rubric, catalog);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.diagnostics[0]).toEqual(expect.objectContaining({
        code: 'ASSESSMENT_REMEDIATION_001',
        severity: 'error',
      }));
    }
  });
});
```

- [ ] **Step 2: Create the package and implement schemas and result composition**

```json
{
  "name": "@roadmap/assessment-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@roadmap/rubric-schema": "workspace:*",
    "@roadmap/validation-core": "workspace:*",
    "zod": "catalog:"
  },
  "devDependencies": {
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/assessment-core/src/remediation.ts
import type { Rubric } from '@roadmap/rubric-schema';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { z } from 'zod';

export const RemediationCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.array(z.object({
    criterion: z.string().min(1),
    competency: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/),
    lessons: z.array(z.string().regex(/^lesson-[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    exercises: z.array(z.string().regex(/^ex-[a-z0-9]+(?:-[a-z0-9]+)*$/)),
    retake: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
}).strict().superRefine((catalog, context) => {
  const ids = catalog.entries.map((entry) => entry.criterion);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'One remediation entry per criterion is allowed' });
});

export type RemediationCatalog = z.infer<typeof RemediationCatalogSchema>;

export function validateRemediationCoverage(
  rubric: Rubric,
  catalog: RemediationCatalog,
): ValidationOutcome<void> {
  const covered = new Set(catalog.entries.map((entry) => entry.criterion));
  const missing = rubric.criteria
    .filter((criterion) => (criterion.required || criterion.critical) && !covered.has(criterion.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  if (missing.length > 0) {
    return failure(missing.map((criterion) => ({
      code: 'ASSESSMENT_REMEDIATION_001',
      severity: 'error' as const,
      location: { file: rubric.id, pointer: `/criteria/${criterion.id}` },
      observed: criterion.id,
      expected: 'One remediation entry for every required or critical criterion',
      reason: 'A blocking rubric failure would have no deterministic recovery path',
      remediation: `Add a remediation catalog entry for ${criterion.id}`,
      documentation: 'docs/authoring/remediation.md',
    })));
  }

  return success(undefined);
}
```

```ts
// packages/assessment-core/src/result.ts
import type { RubricEvaluation } from '@roadmap/rubric-schema';
import type { RemediationCatalog } from './remediation.js';

export interface AssessmentResult {
  status: 'passed' | 'needs-remediation';
  blocking: readonly RemediationCatalog['entries'][number][];
}

export function createAssessmentResult(evaluation: RubricEvaluation, catalog: RemediationCatalog): AssessmentResult {
  const byCriterion = new Map(catalog.entries.map((entry) => [entry.criterion, entry]));
  const blocking = evaluation.blockingCriterionIds.map((criterion) => {
    const entry = byCriterion.get(criterion);
    if (!entry) throw new Error(`No remediation entry for blocking criterion ${criterion}`);
    return entry;
  });
  return { status: evaluation.status, blocking };
}
```

- [ ] **Step 3: Run the remediation-coverage test**

Run `pnpm --filter @roadmap/assessment-core test -- assessment.test.ts`. The missing entry must produce `ASSESSMENT_REMEDIATION_001` with severity `error`; warning-only behavior is a test failure.

- [ ] **Step 4: Export, verify all assessment packages, and commit**

```ts
// packages/assessment-core/src/index.ts
export * from './remediation.js';
export * from './result.js';
```

Run:

```bash
pnpm --filter @roadmap/command-runner test
pnpm --filter @roadmap/exercise-contract test
pnpm --filter @roadmap/exercise-runner test
pnpm --filter @roadmap/rubric-schema test
pnpm --filter @roadmap/evidence-schema test
pnpm --filter @roadmap/assessment-core test
pnpm check
pnpm test
```

Commit:

```bash
git add vitest.config.ts packages/assessment-core fixtures/assessment
git commit -m "feat: produce criterion-level remediation"
```

## WP-05–06 exit gate

Run from a fresh clone:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm exercise:verify -- exercises/javascript/ex-js-closure-counter .tmp/exercise baseline --json
```

Then run learner mode and require the expected non-zero result:

```bash
pnpm exercise:verify -- exercises/javascript/ex-js-closure-counter .tmp/exercise learner --json
```

Acceptance evidence must prove:

- Metadata cannot inject shell operators
- Timeout and missing-command paths fail deterministically
- Starter materialization excludes `solution/`
- Baseline verification passes on incomplete learner work
- Learner verification fails for the intended missing implementation
- Reference solution passes the same learner verifier
- Protected-file modification is rejected
- A critical rubric score below `2` blocks completion regardless of other scores
- Evidence manifests pin immutable commits and explicit, independent trust attestations
- Missing remediation for a blocking criterion is an error
- The package graph has no dependency on `apps/docs`

## Checkpoint

Stop after the exit gate. Request independent test-design review for command execution, protected-path detection, rubric false positives, and evidence trust semantics before starting template publication.
