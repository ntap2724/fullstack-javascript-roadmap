# Release 0 Kernel and Vertical-Slice Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the greenfield repository kernel for WP-00 through WP-09, prove all five architecture spikes, and finish WP-10 as a real but intentionally narrow Release 1 vertical-slice skeleton.

**Architecture:** Educational content remains the source of truth. TypeScript domain packages parse and validate curriculum, assessment, evidence, and template contracts; Astro Starlight and generated learner repositories are downstream adapters. Every boundary fails closed, produces structured diagnostics, and is tested with valid and intentionally invalid fixtures.

**Tech Stack:** Node.js 24 LTS family, pnpm workspace, TypeScript strict mode, Zod 4, Vitest projects, Astro, Starlight, Playwright, GitHub Actions, Markdown, YAML, and Node.js cross-platform scripts.

## Global Constraints

- This is a greenfield repository; no architecture, content, code, identifiers, or constraints are inherited from any previous repository
- Use the Node.js 24 LTS release family; WP-00 pins the exact security-supported 24.x patch used for evidence
- Pin the exact pnpm version in `packageManager`, commit `pnpm-lock.yaml`, and use frozen installs in CI
- Use pnpm workspaces and `workspace:` for internal dependencies
- Enable workspace-cycle failure and filtered-command failure
- Do not add Turborepo, Nx, or another task orchestrator in Release 0
- Use TypeScript with `strict: true`; TypeScript types never replace runtime validation
- Use Zod runtime schemas and generate JSON Schema from the canonical schemas
- Use Vitest `projects`, not the deprecated `vitest.workspace` configuration
- Use real PostgreSQL only when a test claims PostgreSQL-specific behavior; Release 0 itself does not require a database service
- Primary supported operating systems are Windows 11 and Linux; avoid Bash-only package scripts
- Use Node.js scripts for cross-platform automation and `node:path` for path construction
- Root public commands are `pnpm dev`, `pnpm check`, `pnpm test`, `pnpm verify`, `pnpm verify:templates`, and `pnpm verify:release`
- Every learner starter exposes `pnpm verify`; template publication also uses an internal baseline verifier so incomplete learner work is not confused with a broken template
- Curriculum is the single source of truth; the website must not maintain a second hand-edited content copy
- Stable semantic IDs are independent of titles, file paths, lesson numbers, and website routes
- Validation errors include code, location, observed value, expected contract, reason, remediation, and documentation reference
- Validator crashes are failures, not warnings or passes
- Publication uses an allowlist, detects solution and secret leakage, rejects symlinks by default, and verifies generated repositories outside the monorepo
- No bulk curriculum authoring begins until all five architecture spikes pass
- Codex works from explicit task contracts in isolated worktrees; implementation and verification are distinct states

---

## Plan package map

Execute the plans in this order:

1. [`2026-07-26-wp-00-01-bootstrap-governance.md`](./2026-07-26-wp-00-01-bootstrap-governance.md)
2. [`2026-07-26-wp-02-03-curriculum-kernel.md`](./2026-07-26-wp-02-03-curriculum-kernel.md)
3. [`2026-07-26-wp-04-starlight-adapter.md`](./2026-07-26-wp-04-starlight-adapter.md)
4. [`2026-07-26-wp-05-06-assessment-kernel.md`](./2026-07-26-wp-05-06-assessment-kernel.md)
5. [`2026-07-26-wp-07-08-template-publication.md`](./2026-07-26-wp-07-08-template-publication.md)
6. [`2026-07-26-wp-09-cross-platform-ci.md`](./2026-07-26-wp-09-cross-platform-ci.md)
7. [`2026-07-26-wp-10-vertical-slice-skeleton.md`](./2026-07-26-wp-10-vertical-slice-skeleton.md)

Each child plan produces a separately reviewable, working increment. Do not dispatch later plans until the predecessor's exit gate passes, except for explicitly identified parallel tasks.

## Locked implementation interpretations

These choices resolve implementation ambiguity without changing the approved product design.

### Identifier families

Use separate validators for separate semantic roles:

```text
Competency IDs
└── Dotted semantic IDs such as js.function.closure

Artifact IDs
└── Kind-prefixed kebab IDs such as lesson-js-closure-private-state

Route slugs
└── URL paths such as javascript/functions/closure-private-state
```

The route slug and file path may change without changing the stable semantic ID.

### Machine-executed command contract

Human-facing documentation may show shell commands as text. Metadata executed by tooling uses an argv-based structure so the runner does not require `shell: true`:

```ts
export interface CommandSpec {
  command: string;
  args: readonly string[];
  cwd: string;
  timeoutMs: number;
}
```

### Publication channels

```text
development
├── draft
├── review
├── published
├── deprecated
└── withdrawn

preview
├── review
├── published
├── deprecated
└── withdrawn

production
├── published
├── deprecated
└── withdrawn
```

A `published` item may not depend on `draft` or `review` content.

### Starter verification modes

```text
pnpm verify:baseline
└── Proves a generated starter installs, checks, tests its infrastructure, and builds before learner work

pnpm verify
└── Evaluates learner-facing completion criteria and may initially report incomplete work
```

The template publisher invokes the baseline contract. Curriculum and learner instructions invoke the learner contract.

## Shared interface registry

The child plans must use these names consistently.

```ts
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

export type ValidationOutcome<T> =
  | { ok: true; value: T; diagnostics: readonly Diagnostic[] }
  | { ok: false; diagnostics: readonly Diagnostic[] };
```

```ts
export type PublicationStatus =
  | 'draft'
  | 'review'
  | 'published'
  | 'deprecated'
  | 'withdrawn';

export type PublicationChannel = 'development' | 'preview' | 'production';

export interface CurriculumDocument<T extends CurriculumEntity = CurriculumEntity> {
  filePath: string;
  body: string;
  data: T;
}

export interface CurriculumCorpus {
  documents: readonly CurriculumDocument[];
}
```

```ts
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
```

```ts
export interface GeneratedFileRecord {
  path: string;
  bytes: number;
  sha256: string;
}

export interface PublicationArtifact {
  root: string;
  files: readonly GeneratedFileRecord[];
  functionalSha256: string;
}
```

Any task that needs a different name or signature must first amend this master plan and the affected neighboring plan in the same review.

## Work-package dependency graph

```text
WP-00 Repository bootstrap
        ↓
WP-01 Governance
        ↓
WP-02 Curriculum schemas
        ↓
WP-03 Curriculum graph
        ├──────────────────────┐
        ↓                      ↓
WP-04 Starlight adapter    WP-05 Exercise kernel
        │                      ↓
        │                  WP-06 Rubric and evidence
        └────────────┬─────────┘
                     ↓
             WP-07 Template builder
                     ↓
             WP-08 Leak prevention
                     ↓
             WP-09 Cross-platform CI
                     ↓
             WP-10 Vertical-slice skeleton
```

WP-04 and WP-05 may proceed in parallel only after WP-02 and the stable-ID registry from WP-03 are merged. WP-06 depends on `validation-core` but may overlap the final graph-validation tasks if file ownership does not overlap.

## Release 0 merge gates

Every work-package PR must include:

```markdown
## Objective

## Changed behavior

## Files changed

## Verification performed

| Command | Exit | Evidence |
|---|---:|---|

## Acceptance criteria

| Criterion | Evidence | Status |
|---|---|---|

## Unverified areas

## Known limitations
```

A work package is not complete until:

- Its targeted tests pass
- `pnpm check` passes
- The relevant broader verifier passes
- Intentional invalid fixtures fail with the expected diagnostic code
- The diff has an independent review appropriate to its risk level
- Generated artifacts, when present, are inspected rather than trusted from a summary
- The implementation report names any behavior not exercised

## Architecture-spike gates

### Spike 1: Curriculum to Starlight

Pass when external curriculum content loads, validates, renders, keeps semantic IDs separate from routes, derives navigation, excludes non-production statuses, and hot reloads in development.

### Spike 2: Curriculum graph

Pass when valid, missing-reference, duplicate-ID, self-cycle, two-node cycle, multi-node cycle, and publication-state fixtures produce exact expected results.

### Spike 3: Starter publication

Pass when a source template generates an independent repository that completes a fresh frozen install, baseline verification, tests, and build outside the monorepo.

### Spike 4: Cross-platform commands

Pass when the same root public command contract succeeds on Windows and Linux from a fresh clone.

### Spike 5: Leak prevention

Pass when intentional solution-path, answer-content, internal-reference, secret, dotfile, and symlink fixtures are rejected with stable diagnostic codes.

## Final Release 0 acceptance command

The final WP-10 plan creates `scripts/verify-release-0.mjs`. The release gate is:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm verify
pnpm verify:templates
pnpm verify:release
pnpm release:gate
```

Expected result: every command exits `0`, while the negative-fixture suite proves each invalid fixture exits non-zero with its declared diagnostic code.

## Execution handoff

After all plan files are reviewed, implementation starts in an isolated worktree. Use one of these modes:

1. **Subagent-driven development:** one fresh implementation agent per task, followed by spec-compliance review and code-quality review
2. **Executing plans inline:** complete small task batches in one session, stop at the checkpoint at the end of each work package, and review evidence before continuing

Do not start both modes against the same worktree.
