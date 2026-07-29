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
