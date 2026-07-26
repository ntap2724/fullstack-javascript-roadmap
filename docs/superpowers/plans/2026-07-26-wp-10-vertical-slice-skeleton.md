# WP-10 Release 1 Vertical-Slice Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the proven Release 0 kernel into a real, internally coherent Release 1 skeleton for the Workshop Enrollment vertical slice: approved architecture decisions, a reachable competency graph, fully specified curriculum contracts, a buildable fullstack starter, aligned assessments, and an executable backlog.

**Architecture:** The skeleton uses a React + Vite TypeScript SPA, a standalone Express TypeScript API, shared Zod wire contracts, PostgreSQL + Drizzle schema source, and server-managed sessions through secure `HttpOnly` cookies. Release 0 proves structure and baseline health only. Learner-facing completion tests remain intentionally failing until Release 1 tasks implement workshop enrollment, authentication, transactions, deployment, and evidence.

**Tech Stack:** React, Vite, TypeScript strict mode, Express, Zod, PostgreSQL, Drizzle, Vitest, Supertest, Playwright, pnpm workspace, Astro Starlight, Markdown, YAML, and GitHub Actions.

## Global Constraints

- Workshop Enrollment is the fixed reference domain for Release 1 only; learner capstones remain domain-selectable later
- Core stack is React + Vite, Express, PostgreSQL, Drizzle, and TypeScript
- Next.js, NestJS, and Prisma do not appear in the vertical-slice core
- JavaScript runtime and browser competencies precede TypeScript, React, Express, and Drizzle competencies
- The skeleton contains no empty module pages, fake completion claims, copied tutorial prose, or reserved incomplete-content markers
- Content not ready for production uses `review` or `draft`; production routes never advertise Release 1 as complete
- Baseline starter verification must pass without a running PostgreSQL service
- Learner verification must fail because the primary enrollment workflow is not implemented, not because setup is broken
- Authentication enforcement belongs to the backend; frontend authorization affordances are not security controls
- Session cookies are `HttpOnly`, `Secure` in production, host-only, `SameSite=Lax`, and paired with explicit CSRF protection for state-changing requests
- PostgreSQL constraints and transactions protect enrollment invariants; frontend checks never become the only capacity control
- Every vertical-slice assessment maps to competencies, rubric criteria, evidence, and remediation
- WP-10 may define Release 1 work; it must not implement the full Release 1 curriculum under the Release 0 completion claim

---

## File map

```text
docs/decisions/
├── 0002-reference-authentication.md
├── 0003-workshop-enrollment-boundaries.md
└── 0004-reference-deployment-shape.md

curriculum/
├── releases/release-0-1-0.md
├── tracks/track-core-vertical-slice.md
├── gates/
│   ├── gate-engineering-baseline.md
│   ├── gate-js-browser-essentials.md
│   ├── gate-typescript-bridge.md
│   ├── gate-react-spa.md
│   ├── gate-express-postgresql.md
│   ├── gate-fullstack-integration.md
│   └── gate-mini-capstone.md
├── competencies/*.md
├── modules/*.md
├── lessons/*.md
├── assessments/*.md
└── projects/project-workshop-enrollment.md

projects/milestones/workshop-enrollment/
├── project.yaml
├── brief.vi.md
├── acceptance/contract.yaml
├── rubric/rubric.yaml
├── remediation/catalog.yaml
├── evidence/requirements.yaml
├── change-request/multiple-sessions.vi.md
└── debugging/duplicate-enrollment.vi.md

templates/fullstack-vertical-slice/
├── template.yaml
├── files/
│   ├── apps/web/**
│   ├── apps/api/**
│   ├── packages/contracts/**
│   ├── packages/database/**
│   ├── evidence/**
│   ├── .github/workflows/verify.yml
│   ├── .env.example
│   ├── .gitignore
│   ├── .node-version
│   ├── AGENTS.md
│   ├── README.md
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── pnpm-workspace.yaml
│   ├── tsconfig.base.json
│   └── vitest.config.ts
├── acceptance/
├── private-fixtures/
└── publication-tests/expected-files.json

planning/release-1/
├── backlog.yaml
├── dependency-graph.md
├── issue-contracts/*.md
└── pilot-protocol.md

scripts/
├── verify-wp10-skeleton.mjs
└── verify-wp10-skeleton.test.mjs
```

## Locked reference decisions for the skeleton

```text
Authentication
└── Opaque server-managed session identifier in a secure HttpOnly cookie

Session persistence
└── PostgreSQL session table owned by the API

CSRF
└── Explicit synchronizer token for state-changing requests plus Origin validation

Wire contracts
└── Shared Zod schemas for HTTP payloads; no shared database entities in the frontend

Deployment shape
├── Static web application
├── Independently deployed API
└── Managed PostgreSQL

Local development
├── Web: localhost:5173
├── API: localhost:3000
└── PostgreSQL: localhost:5432
```

These are reference-stack choices, not universal claims that every production system must use the same design.

### Task 1: Record authentication and system-boundary decisions before scaffolding

**Files:**
- Create: `docs/decisions/0002-reference-authentication.md`
- Create: `docs/decisions/0003-workshop-enrollment-boundaries.md`
- Create: `docs/decisions/0004-reference-deployment-shape.md`
- Modify: `docs/architecture/README.md`

**Interfaces:**
- Consumes: approved specification's deferred-decision section
- Produces: explicit constraints that every later WP-10 task and Release 1 issue can cite

- [ ] **Step 1: Write ADR 0002 with the chosen session model**

The ADR must contain this decision:

```markdown
# ADR 0002: Reference authentication uses server-managed sessions

**Status:** Accepted for the Release 1 reference stack

## Decision

The reference API issues a cryptographically random opaque session identifier after successful login. The browser stores it only in a host-only `HttpOnly` cookie. Production cookies use `Secure`, `SameSite=Lax`, and `Path=/`; the API stores only a one-way hash of the identifier with user, creation, expiry, and revocation data in PostgreSQL.

State-changing requests require a synchronizer CSRF token bound to the session and an allowed `Origin`. The React application sends requests with credentials enabled. The backend remains the only authorization enforcement point.

## Rejected alternatives

- Long-lived bearer tokens in `localStorage`, because script access unnecessarily enlarges the XSS credential boundary
- JWT as the first authentication mechanism, because self-contained token invalidation and renewal would distract from the server-session lifecycle being taught
- Frontend-only route protection, because it cannot enforce server resource access

## Consequences

- Local and reference production deployments must support credentialed cross-origin requests between same-site origins
- Session expiry, logout, rotation, CSRF, CORS, and negative authorization tests become required curriculum topics
- This ADR does not prohibit a later token-authentication specialization
```

- [ ] **Step 2: Write ADR 0003 with package and trust boundaries**

The decision must define:

```text
apps/web
└── Owns UI state, URL state, forms, and API adapters

apps/api
└── Owns HTTP transport, authentication, authorization, and application workflows

packages/contracts
└── Owns public request/response schemas only

packages/database
└── Owns Drizzle schema, migrations, and database adapters; never imported by web
```

It must explicitly reject importing Drizzle row types into React and importing React code into the API.

- [ ] **Step 3: Write ADR 0004 with provider-neutral deployment constraints**

The ADR must choose a three-artifact shape but defer vendor selection:

```text
Static web artifact
Container- or process-based API artifact
Managed PostgreSQL database
```

Required properties:

- HTTPS for browser-accessible production endpoints
- API and web origins configured explicitly
- Server-side secrets unavailable to the static web build
- Migration step is separate from API process startup
- Health endpoint does not disclose secrets or dependency credentials
- Rollback reasoning appears in Release 1, but automated rollback is not a Release 0 deliverable

- [ ] **Step 4: Add ADR links and run documentation checks**

```bash
pnpm format:check
pnpm docs:build
```

- [ ] **Step 5: Commit**

```bash
git add docs/decisions docs/architecture/README.md
git commit -m "docs: decide vertical slice security boundaries"
```

### Task 2: Define the Release 1 track, gates, and reachable competency graph

**Files:**
- Create: `curriculum/releases/release-0-1-0.md`
- Create: `curriculum/tracks/track-core-vertical-slice.md`
- Create: `curriculum/gates/*.md`
- Create: `curriculum/competencies/*.md`
- Create: `curriculum/modules/*.md`
- Create: `curriculum/lessons/*.md`
- Create: `curriculum/assessments/*.md`
- Modify: `packages/curriculum-schema/src/entities.ts`
- Modify: `packages/curriculum-schema/src/index.ts`
- Modify: `packages/curriculum-schema/test/entities.test.ts`
- Modify: `packages/curriculum-graph/src/types.ts`
- Modify: `packages/curriculum-graph/src/registry.ts`
- Modify: `packages/curriculum-graph/test/registry.test.ts`
- Modify: `fixtures/expected-failures.json`

**Interfaces:**
- Consumes: Markdown-frontmatter curriculum loading, graph validators, publication channels, and stable-ID conventions
- Produces: `ReleaseSchema`, `GateSchema`, `ProjectSchema`, and one acyclic, reference-resolved path from engineering baseline through mini-capstone

- [ ] **Step 1: Write failing schema tests for release, gate, project, and track gate references**

```ts
// append to packages/curriculum-schema/test/entities.test.ts
import { GateSchema, ProjectSchema, ReleaseSchema, TrackSchema } from '../src/index.js';

it('accepts the Release 1 technical-preview catalog', () => {
  expect(ReleaseSchema.parse({
    schemaVersion: 1,
    kind: 'release',
    id: 'release-0-1-0',
    slug: 'releases/0-1-0',
    title: 'Release 1 Technical Preview Skeleton',
    description: 'A bounded path that proves the Release 1 architecture without claiming curriculum completion',
    status: 'review',
    prerequisites: [],
    introducedIn: '0.1.0',
    lastReviewedIn: '0.1.0',
    version: '0.1.0',
    maturity: 'experimental',
    track: 'track-core-vertical-slice',
    entryGate: 'gate-engineering-baseline',
    exitGate: 'gate-mini-capstone',
    claims: ['Repository kernel and reference path structure are implemented'],
    nonClaims: ['Junior Fullstack readiness'],
  }).kind).toBe('release');
});

it('requires track gates and a gate exit assessment', () => {
  expect(() => TrackSchema.parse({
    schemaVersion: 1,
    kind: 'track',
    id: 'track-core-vertical-slice',
    slug: 'roadmap/core-vertical-slice',
    title: 'Core vertical slice',
    description: 'Technical preview',
    status: 'review',
    prerequisites: [],
    introducedIn: '0.1.0',
    lastReviewedIn: '0.1.0',
    requiredCompetencies: ['js.function.closure'],
    modules: ['module-javascript-essentials'],
    gates: [],
  })).toThrow();
  expect(() => GateSchema.parse({ kind: 'gate' })).toThrow();
});

it('accepts a project page that points to an external machine-readable contract', () => {
  expect(ProjectSchema.parse({
    schemaVersion: 1,
    kind: 'project',
    id: 'project-workshop-enrollment',
    slug: 'projects/workshop-enrollment',
    title: 'Workshop Enrollment',
    description: 'Reference vertical-slice milestone',
    status: 'review',
    prerequisites: ['gate-express-postgresql'],
    introducedIn: '0.1.0',
    lastReviewedIn: '0.1.0',
    competencies: ['db.transaction.atomic-enrollment'],
    contractPath: 'projects/milestones/workshop-enrollment/project.yaml',
  }).contractPath).toContain('workshop-enrollment');
});
```

- [ ] **Step 2: Run schema tests and confirm the new entities are missing**

```bash
pnpm --filter @roadmap/curriculum-schema test
```

Expected: FAIL because `ReleaseSchema`, `GateSchema`, `ProjectSchema`, and `TrackSchema.gates` do not exist.

- [ ] **Step 3: Extend the canonical curriculum entity union**

```ts
// append definitions in packages/curriculum-schema/src/entities.ts
import path from 'node:path';

const SafeRepositoryPathSchema = z.string().min(1).refine(
  (value) => !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value) && !value.split(/[\\/]/).includes('..'),
  'Repository path must be relative and contained',
);

export const ReleaseSchema = z.object({
  ...CommonArtifactFields,
  kind: z.literal('release'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  maturity: z.enum(['experimental', 'reviewed', 'validated', 'stable']),
  track: ArtifactIdSchema,
  entryGate: ArtifactIdSchema,
  exitGate: ArtifactIdSchema,
  claims: z.array(z.string().min(1)).min(1),
  nonClaims: z.array(z.string().min(1)).min(1),
}).strict();

export const GateSchema = z.object({
  ...CommonArtifactFields,
  kind: z.literal('gate'),
  competencies: z.array(CompetencyIdSchema).min(1),
  entryEvidence: z.array(z.string().min(1)).min(1),
  exitAssessment: ArtifactIdSchema,
  criticalCriteria: z.array(z.string().min(1)).min(1),
  remediation: z.array(ArtifactIdSchema).min(1),
  maturity: z.literal('experimental'),
}).strict();

export const ProjectSchema = z.object({
  ...CommonArtifactFields,
  kind: z.literal('project'),
  competencies: z.array(CompetencyIdSchema).min(1),
  contractPath: SafeRepositoryPathSchema,
}).strict();
```

Add one required field to the existing track schema:

```ts
gates: z.array(ArtifactIdSchema).min(1),
```

Add `ReleaseSchema`, `GateSchema`, and `ProjectSchema` to `CurriculumEntitySchema` and export them from `packages/curriculum-schema/src/index.ts`.

- [ ] **Step 4: Extend graph edge extraction and write unresolved-reference tests**

Add edge types and mappings:

```text
release.track                 → contains, release → track
release.entryGate             → contains, release → gate
release.exitGate              → contains, release → gate
track.gates                   → contains, track → gate
track.requiredCompetencies    → contains, track → competency
gate.competencies             → contains, gate → competency
gate.exitAssessment           → assesses, gate → assessment
gate.remediation              → remediates, gate → assessment
project.competencies          → contains, project → competency
```

```ts
// append to packages/curriculum-graph/test/registry.test.ts
it('rejects a release whose exit gate does not resolve', async () => {
  const outcome = await graphFixture('invalid/release-missing-exit-gate');
  expect(outcome.ok).toBe(false);
  if (!outcome.ok) {
    expect(outcome.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CURRICULUM_REFERENCE_001' }),
    ]));
  }
});
```

Create `fixtures/curriculum/invalid/release-missing-exit-gate/` with otherwise valid review content and an unresolved `exitGate`.

- [ ] **Step 5: Create the Release 1 technical-preview catalog as Markdown**

```markdown
---
schemaVersion: 1
kind: release
id: release-0-1-0
slug: releases/0-1-0
title: Release 1 Technical Preview Skeleton
description: A bounded path that proves the Release 1 architecture without claiming curriculum completion
status: review
prerequisites: []
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
version: 0.1.0
maturity: experimental
track: track-core-vertical-slice
entryGate: gate-engineering-baseline
exitGate: gate-mini-capstone
claims:
  - Repository kernel and reference path structure are implemented
  - Vertical-slice contracts and starter boundaries are reviewable
nonClaims:
  - Junior Fullstack readiness
  - Complete self-study path
  - Stable curriculum
---

This release is a technical-preview skeleton. It proves that the intended learning path, contracts, and starter can be validated together; it does not claim that the Release 1 lessons or learner outcomes are complete.
```

Do not create a YAML-only release file: the Release 0 loader owns Markdown and MDX documents, so the catalog must pass through the same source-of-truth pipeline as every other curriculum entity.

- [ ] **Step 6: Define the exact seven-gate chain**

| Gate ID | Prerequisite | Exit assessment | Competency focus |
|---|---|---|---|
| `gate-engineering-baseline` | none | `assessment-engineering-baseline` | reproducible setup, pull request |
| `gate-js-browser-essentials` | engineering gate | `assessment-js-browser-essentials` | JavaScript values, closure, async, DOM, fetch |
| `gate-typescript-bridge` | JS/browser gate | `assessment-typescript-bridge` | untrusted input and narrowing |
| `gate-react-spa` | TypeScript gate | `assessment-react-spa` | state ownership and server state |
| `gate-express-postgresql` | React gate | `assessment-express-postgresql` | HTTP, validation, session, authorization, relational constraints, transaction |
| `gate-fullstack-integration` | Express/PostgreSQL gate | `assessment-fullstack-integration` | error mapping and duplicate submission |
| `gate-mini-capstone` | fullstack gate | `assessment-mini-capstone` | technical walkthrough and project evidence |

Every gate document uses `kind: gate`, `status: review`, `maturity: experimental`, the predecessor gate in `prerequisites`, at least one `entryEvidence`, at least one observable `criticalCriteria`, and one assessment ID in both `exitAssessment` and `remediation` where the technical preview uses the same bounded assessment for retake guidance.

- [ ] **Step 7: Define the exact competency, module, assessment, and orientation-lesson maps**

Create these nineteen competency IDs:

```text
engineering.repository.reproducible-setup
engineering.git.pull-request
js.value.object-identity
js.function.closure
js.async.promise-error
browser.dom.event-flow
browser.fetch.http-boundary
ts.narrowing.untrusted-input
react.state.ownership
react.server-state.lifecycle
http.request-response-semantics
api.validation.runtime-boundary
api.authentication.session-lifecycle
api.authorization.resource-ownership
db.model.relational-constraints
db.transaction.atomic-enrollment
fullstack.contract.error-mapping
fullstack.incident.duplicate-submission
career.evidence.technical-walkthrough
```

Create these nine modules and orientation lessons:

| Module | Orientation lesson | Assessment |
|---|---|---|
| `module-engineering-baseline` | `lesson-engineering-baseline-orientation` | `assessment-engineering-baseline` |
| `module-javascript-essentials` | `lesson-javascript-essentials-orientation` | `assessment-js-browser-essentials` |
| `module-browser-interaction` | `lesson-browser-interaction-orientation` | `assessment-js-browser-essentials` |
| `module-typescript-bridge` | `lesson-typescript-bridge-orientation` | `assessment-typescript-bridge` |
| `module-react-spa` | `lesson-react-spa-orientation` | `assessment-react-spa` |
| `module-http-express` | `lesson-http-express-orientation` | `assessment-express-postgresql` |
| `module-postgresql-drizzle` | `lesson-postgresql-drizzle-orientation` | `assessment-express-postgresql` |
| `module-fullstack-integration` | `lesson-fullstack-integration-orientation` | `assessment-fullstack-integration` |
| `module-mini-capstone` | `lesson-mini-capstone-orientation` | `assessment-mini-capstone` |

Each competency sets its required mastery level and references at least one assessment and the same bounded assessment as remediation. Each module contains real Workshop Enrollment scope, an artifact, non-goals, and its orientation lesson. Every orientation lesson body contains:

```markdown
## Problem
## Mental model
## Minimal reference example
## Counterexample
## Checkpoint
## Current technical-preview boundary
## Next dependency
```

The minimal example must compile, run, or pass schema validation. The boundary section names one concrete Release 1 backlog item that will replace the orientation-only coverage.

- [ ] **Step 8: Create the track document with all references declared**

The track frontmatter must contain:

```yaml
kind: track
id: track-core-vertical-slice
status: review
requiredCompetencies:
  # all nineteen IDs in the order above
modules:
  # all nine module IDs in the order above
gates:
  # all seven gate IDs in the order above
```

The body explicitly says that this is a technical-preview route and not a completed Junior Fullstack curriculum.

- [ ] **Step 9: Validate schema, graph, preview filtering, and accidental claims**

Create `fixtures/curriculum/invalid/experimental-release-claims-complete/` whose experimental release lists `Junior Fullstack readiness` under `claims`. Add semantic diagnostic `CURRICULUM_RELEASE_001` and add that fixture to `fixtures/expected-failures.json`.

Run:

```bash
pnpm --filter @roadmap/curriculum-schema test
pnpm --filter @roadmap/curriculum-graph test
pnpm content:validate curriculum --format json
pnpm docs:build
```

Expected:

- The graph is acyclic and every release, gate, track, module, lesson, assessment, and competency reference resolves
- Every required competency has assessment and remediation references
- Production build excludes review-only route pages from completion claims
- The intentional experimental-completion fixture fails with `CURRICULUM_RELEASE_001`

- [ ] **Step 10: Commit the schema extension and real skeleton path**

```bash
git add packages/curriculum-schema packages/curriculum-graph curriculum fixtures/curriculum/invalid fixtures/expected-failures.json
git commit -m "feat: define vertical slice competency path"
```

### Task 3: Define the Workshop Enrollment project, assessment map, and adaptive tasks

**Files:**
- Create: `curriculum/projects/project-workshop-enrollment.md`
- Create: `projects/milestones/workshop-enrollment/project.yaml`
- Create: `projects/milestones/workshop-enrollment/brief.vi.md`
- Create: `projects/milestones/workshop-enrollment/acceptance/contract.yaml`
- Create: `projects/milestones/workshop-enrollment/rubric/rubric.yaml`
- Create: `projects/milestones/workshop-enrollment/remediation/catalog.yaml`
- Create: `projects/milestones/workshop-enrollment/evidence/requirements.yaml`
- Create: `projects/milestones/workshop-enrollment/change-request/multiple-sessions.vi.md`
- Create: `projects/milestones/workshop-enrollment/debugging/duplicate-enrollment.vi.md`
- Create: `projects/milestones/workshop-enrollment/test/contracts.test.ts`

**Interfaces:**
- Consumes: exercise, rubric, evidence, and remediation schemas
- Produces: a complete machine-readable contract for the Release 1 mini-capstone

- [ ] **Step 1: Define project scope and non-goals**

```yaml
# project.yaml
schemaVersion: 1
id: project-workshop-enrollment
version: 0.1.0
title: Workshop Enrollment
status: review
track: track-core-vertical-slice
competencies:
  - react.state.ownership
  - api.validation.runtime-boundary
  - api.authentication.session-lifecycle
  - api.authorization.resource-ownership
  - db.model.relational-constraints
  - db.transaction.atomic-enrollment
  - fullstack.contract.error-mapping
  - fullstack.incident.duplicate-submission
starterTemplate: template-fullstack-vertical-slice
rubric: rubric-workshop-enrollment
remediation: remediation-workshop-enrollment
changeRequest: change-request-workshop-multiple-sessions
debuggingTask: debugging-workshop-duplicate-enrollment
```

The brief must define these roles and workflows:

```text
Anonymous user
├── View open workshops
└── Create account or sign in

Learner
├── Enroll while capacity remains
├── Cancel own enrollment
└── View own enrollments

Admin
├── Create and update workshops
├── Close enrollment
└── View enrollment count
```

Non-goals:

- Payments
- Email delivery
- Multi-tenant organizations
- Recommendation systems
- Realtime seat updates
- Native mobile application

- [ ] **Step 2: Encode observable acceptance criteria**

`acceptance/contract.yaml` must include identifiers for:

```text
web.public-workshop-list
web.authentication-states
web.loading-empty-error
api.invalid-payload-400
api.unauthenticated-401
api.forbidden-resource-403
api.enroll-success-201
api.duplicate-enrollment-409
db.unique-user-workshop
db.capacity-transaction
fullstack.repeated-submit-idempotent-outcome
evidence.commit-pinned
```

Each criterion declares verification layer, related competency, required evidence, and whether it is critical.

- [ ] **Step 3: Define a criterion-based rubric**

Critical criteria include:

- Server-side authorization
- Password and session handling
- Unique enrollment invariant
- Atomic capacity workflow
- Runtime request validation
- Fresh-clone reproducibility
- No credential in repository

Required noncritical criteria include:

- Accessible primary workflow
- Loading, empty, error, and retry states
- English README
- API documentation
- Debugging report

Every criterion defines levels `0` through `3` using observable language.

- [ ] **Step 4: Define adaptive tasks**

The debugging report begins with:

> Người dùng đôi khi tạo hai lượt đăng ký khi nhấn nút nhiều lần trong mạng chậm.

Required investigation boundaries:

- Button submission state
- Request duplication
- API idempotency decision
- Unique constraint
- Transaction
- Error mapping
- Regression test

The change request states:

> Mỗi workshop có thể có nhiều session với lịch và sức chứa riêng; enrollment chuyển từ workshop sang session.

It requires impact analysis across data model, migration, API, query keys, UI routes, authorization, and tests. It does not contain an implementation walkthrough.

- [ ] **Step 5: Define evidence requirements and remediation coverage**

Evidence requires:

```text
Public or reviewable repository at a 40-hex commit
CI run for that commit
Deployed web and API URLs when deployment module is reached
Architecture overview
Data model
Authorization matrix
Selected pull requests
Debugging report
Technical walkthrough
```

Every blocking rubric criterion must have exactly one remediation entry with lessons, focused exercises, and retake actions.

- [ ] **Step 6: Write schema-alignment tests**

```ts
// projects/milestones/workshop-enrollment/test/contracts.test.ts
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { RubricSchema } from '@roadmap/rubric-schema';
import { RemediationCatalogSchema, validateRemediationCoverage } from '@roadmap/assessment-core';

describe('Workshop Enrollment contracts', () => {
  it('covers every required or critical rubric criterion with remediation', async () => {
    const rubric = RubricSchema.parse(parse(await readFile(new URL('../rubric/rubric.yaml', import.meta.url), 'utf8')));
    const remediation = RemediationCatalogSchema.parse(parse(await readFile(new URL('../remediation/catalog.yaml', import.meta.url), 'utf8')));
    expect(validateRemediationCoverage(rubric, remediation).ok).toBe(true);
  });
});
```

Add tests that every acceptance criterion references a declared competency and evidence type.

- [ ] **Step 7: Verify and commit**

```bash
pnpm check
pnpm test
pnpm content:validate curriculum --format json
```

Commit:

```bash
git add curriculum/projects projects/milestones/workshop-enrollment
git commit -m "feat: define Workshop Enrollment assessment contract"
```

### Task 4: Create the fullstack starter's shared contracts and database schema

**Files:**
- Create: `templates/fullstack-vertical-slice/template.yaml`
- Create: `templates/fullstack-vertical-slice/files/package.json`
- Create: `templates/fullstack-vertical-slice/files/pnpm-workspace.yaml`
- Create: `templates/fullstack-vertical-slice/files/tsconfig.base.json`
- Create: `templates/fullstack-vertical-slice/files/vitest.config.ts`
- Create: `templates/fullstack-vertical-slice/files/packages/contracts/**`
- Create: `templates/fullstack-vertical-slice/files/packages/database/**`

**Interfaces:**
- Consumes: template publication contract and ADR 0003
- Produces: independently buildable `@workshop/contracts` and `@workshop/database` packages

- [ ] **Step 1: Create source workspace manifests**

Root `files/package.json` exposes:

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter @workshop/web --filter @workshop/api dev",
    "check": "pnpm --recursive --if-present check",
    "test:infrastructure": "pnpm --recursive --if-present test:infrastructure",
    "test": "pnpm test:infrastructure",
    "build": "pnpm --recursive --if-present build",
    "verify:baseline": "pnpm check && pnpm test:infrastructure && pnpm build"
  }
}
```

Use exact external dependency versions selected by `pnpm add --save-exact` inside the template source. Internal packages use `workspace:*`.

- [ ] **Step 2: Add exact core dependencies inside the starter source**

From `templates/fullstack-vertical-slice/files` run commands that create the package manifests and lockfile:

```bash
pnpm add --filter @workshop/contracts --save-exact zod
pnpm add --filter @workshop/database --save-exact drizzle-orm pg
pnpm add --filter @workshop/database -D --save-exact drizzle-kit @types/pg typescript vitest
```

Review every exact version and commit the resulting independent `pnpm-lock.yaml`.

- [ ] **Step 3: Define public wire schemas**

```ts
// packages/contracts/src/workshop.ts
import { z } from 'zod';

export const WorkshopSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(120),
  startsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().positive(),
  enrollmentCount: z.number().int().nonnegative(),
  registrationOpen: z.boolean(),
}).strict();

export const WorkshopListResponseSchema = z.object({
  items: z.array(WorkshopSummarySchema),
}).strict();

export const ApiErrorSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  message: z.string().min(1),
  requestId: z.string().uuid(),
  details: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

No contract exports database table types or session storage rows.

- [ ] **Step 4: Define Drizzle schema with database-enforced invariants**

```ts
// packages/database/src/schema.ts
import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['learner', 'admin']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRole('role').notNull().default('learner'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workshops = pgTable('workshops', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  capacity: integer('capacity').notNull(),
  registrationOpen: boolean('registration_open').notNull().default(true),
}, (table) => [
  check('workshops_capacity_positive', sql`${table.capacity} > 0`),
]);

export const enrollments = pgTable('enrollments', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  workshopId: uuid('workshop_id').notNull().references(() => workshops.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.userId, table.workshopId] })]);

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfTokenHash: text('csrf_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

The capacity invariant cannot be guaranteed by this static table definition alone; the project contract explicitly requires a transaction with locking or an equivalent database-safe strategy in Release 1. Do not claim the schema alone solves concurrent capacity.

- [ ] **Step 5: Add infrastructure tests**

Tests must prove:

- Contract schemas reject extra fields
- Error codes use the declared format
- Database package exports `userRole` and the four tables
- Web package cannot import `@workshop/database` through dependency policy
- Database source contains the `user_role` enum, positive-capacity check, and composite primary key for enrollment uniqueness

- [ ] **Step 6: Define the template metadata and allowlist**

Use ID `template-fullstack-vertical-slice`, version `0.1.0`, entry point `project-workshop-enrollment`, `include: [files/**]`, and the same verification command contract as WP-07. Add version transforms to README and manifest-facing text.

- [ ] **Step 7: Run package tests in the source workspace and commit**

```bash
pnpm --dir templates/fullstack-vertical-slice/files install --frozen-lockfile
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/contracts test:infrastructure
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/database test:infrastructure
```

Commit:

```bash
git add templates/fullstack-vertical-slice
git commit -m "feat: add vertical slice contracts and schema"
```

### Task 5: Add the buildable Express API skeleton with an intentionally incomplete enrollment endpoint

**Files:**
- Create: `templates/fullstack-vertical-slice/files/apps/api/package.json`
- Create: `templates/fullstack-vertical-slice/files/apps/api/tsconfig.json`
- Create: `templates/fullstack-vertical-slice/files/apps/api/src/app.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/src/server.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/src/routes/health.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/src/routes/workshops.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/src/routes/enrollments.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/test/infrastructure.test.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/test/learner.test.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/api/.env.example`

**Interfaces:**
- Consumes: `@workshop/contracts`; does not connect to PostgreSQL during baseline tests
- Produces: Express `createApp()` with `/health`, `/api/workshops`, and learner-incomplete `/api/workshops/:id/enrollments`

- [ ] **Step 1: Add exact Express test dependencies**

From the template source:

```bash
pnpm add --filter @workshop/api --save-exact express zod
pnpm add --filter @workshop/api -D --save-exact @types/express @types/node @types/supertest supertest tsx typescript vitest
```

- [ ] **Step 2: Implement app construction without listening side effects**

```ts
// apps/api/src/app.ts
import express from 'express';
import { randomUUID } from 'node:crypto';
import { healthRouter } from './routes/health.js';
import { workshopsRouter } from './routes/workshops.js';
import { enrollmentsRouter } from './routes/enrollments.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use((request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader('x-request-id', response.locals.requestId);
    next();
  });
  app.use('/health', healthRouter);
  app.use('/api/workshops', workshopsRouter);
  app.use('/api/workshops', enrollmentsRouter);
  return app;
}
```

- [ ] **Step 3: Implement healthy public routes**

`GET /health` returns:

```json
{ "status": "ok" }
```

`GET /api/workshops` returns a response parsed through `WorkshopListResponseSchema` with an empty `items` array. This is a baseline adapter seam, not the finished database implementation.

- [ ] **Step 4: Implement a deliberate `501` enrollment seam**

```ts
// apps/api/src/routes/enrollments.ts
import { Router } from 'express';
import { ApiErrorSchema } from '@workshop/contracts';

export const enrollmentsRouter = Router();

enrollmentsRouter.post('/:workshopId/enrollments', (_request, response) => {
  response.status(501).json(ApiErrorSchema.parse({
    code: 'ENROLLMENT_NOT_IMPLEMENTED',
    message: 'Complete the authenticated transactional enrollment workflow',
    requestId: response.locals.requestId,
  }));
});
```

This explicit seam is allowed because learner verification targets it. The README must describe it as the first incomplete project contract, not as a production behavior.

- [ ] **Step 5: Separate infrastructure and learner tests**

Infrastructure tests assert:

- `createApp` exists
- `/health` returns `200`
- `/api/workshops` returns schema-valid empty list
- `x-powered-by` is absent
- `x-request-id` is a UUID

Learner test asserts POST enrollment eventually returns `201` with a schema-defined enrollment payload. Give the test and assertion the stable diagnostic code so the aggregate learner verifier can classify the intended seam:

```ts
// apps/api/test/learner.test.ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('enrollment learner contract', () => {
  it('LEARNER_API_ENROLLMENT_001 creates an authenticated enrollment', async () => {
    const response = await request(createApp())
      .post('/api/workshops/00000000-0000-4000-8000-000000000001/enrollments')
      .set('cookie', ['session=learner-fixture'])
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', 'learner-fixture');
    expect(response.status, 'LEARNER_API_ENROLLMENT_001').toBe(201);
  });
});
```

It must fail on the starter's explicit `501` response, not on missing environment or database setup.

- [ ] **Step 6: Add strict configuration validation seam**

Create `src/config.ts` with a Zod schema for `PORT`, `DATABASE_URL`, `WEB_ORIGIN`, `SESSION_COOKIE_SECURE`, and `SESSION_TTL_MINUTES`. `server.ts` loads it only when starting the process; app tests remain free of environment setup.

- [ ] **Step 7: Run source-workspace checks and commit**

```bash
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/api check
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/api test:infrastructure
```

Commit:

```bash
git add templates/fullstack-vertical-slice/files/apps/api templates/fullstack-vertical-slice/files/pnpm-lock.yaml
git commit -m "feat: add Express vertical slice skeleton"
```

### Task 6: Add the buildable React SPA skeleton and browser acceptance seam

**Files:**
- Create: `templates/fullstack-vertical-slice/files/apps/web/package.json`
- Create: `templates/fullstack-vertical-slice/files/apps/web/tsconfig.json`
- Create: `templates/fullstack-vertical-slice/files/apps/web/vite.config.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/web/index.html`
- Create: `templates/fullstack-vertical-slice/files/apps/web/src/main.tsx`
- Create: `templates/fullstack-vertical-slice/files/apps/web/src/app/App.tsx`
- Create: `templates/fullstack-vertical-slice/files/apps/web/src/api/workshops.ts`
- Create: `templates/fullstack-vertical-slice/files/apps/web/src/routes/WorkshopListPage.tsx`
- Create: `templates/fullstack-vertical-slice/files/apps/web/src/styles.css`
- Create: `templates/fullstack-vertical-slice/files/apps/web/test/infrastructure.test.tsx`
- Create: `templates/fullstack-vertical-slice/files/apps/web/test/learner.test.tsx`

**Interfaces:**
- Consumes: `WorkshopListResponseSchema` and an injected API base URL
- Produces: accessible application shell with loading, empty, and error state seams

- [ ] **Step 1: Add exact React and Vite dependencies**

From the template source:

```bash
pnpm add --filter @workshop/web --save-exact react react-dom react-router-dom zod
pnpm add --filter @workshop/web -D --save-exact @testing-library/jest-dom @testing-library/react @testing-library/user-event @types/react @types/react-dom @vitejs/plugin-react jsdom typescript vite vitest
```

- [ ] **Step 2: Implement a typed API adapter**

```ts
// apps/web/src/api/workshops.ts
import { WorkshopListResponseSchema } from '@workshop/contracts';

export async function fetchWorkshops(apiBaseUrl: string, signal?: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}/api/workshops`, { signal, credentials: 'include' });
  if (!response.ok) throw new Error(`Workshop request failed with ${response.status}`);
  return WorkshopListResponseSchema.parse(await response.json());
}
```

- [ ] **Step 3: Implement accessible product states**

`WorkshopListPage` must render:

- A heading and landmark
- `role="status"` during loading
- An empty-state explanation when the array is empty
- `role="alert"` with retry button on failure
- A semantic list when workshops exist

Do not add a global state library. The page owns request state locally in the skeleton.

- [ ] **Step 4: Add infrastructure tests**

Tests inject a fake `fetch` and assert:

- Loading state appears before resolution
- Empty state appears for `items: []`
- Error state is keyboard reachable
- Retry calls fetch again
- Invalid API payload is treated as an error through runtime parsing

- [ ] **Step 5: Add an intentionally failing learner test**

The learner test expects an authenticated user to activate an `Enroll` button and observe a success state. Give the test and assertion the stable diagnostic code:

```tsx
// apps/web/test/learner.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/app/App.js';

describe('enrollment learner contract', () => {
  it('LEARNER_WEB_ENROLLMENT_001 completes the authenticated enrollment workflow', async () => {
    render(<App />);
    const button = await screen.findByRole('button', { name: /enroll/i });
    await userEvent.click(button);
    expect(
      await screen.findByText(/enrollment confirmed/i),
      'LEARNER_WEB_ENROLLMENT_001',
    ).toBeInTheDocument();
  });
});
```

The starter does not render that button until Release 1 implements session and enrollment workflows. This is the expected learner failure, not a missing dependency or browser-configuration error.

- [ ] **Step 6: Run checks and commit**

```bash
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/web check
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/web test:infrastructure
pnpm --dir templates/fullstack-vertical-slice/files --filter @workshop/web build
```

Commit:

```bash
git add templates/fullstack-vertical-slice/files/apps/web templates/fullstack-vertical-slice/files/pnpm-lock.yaml
git commit -m "feat: add React vertical slice skeleton"
```

### Task 7: Complete learner-repository governance, CI, evidence, and publication tests

**Files:**
- Create: `templates/fullstack-vertical-slice/files/README.md`
- Create: `templates/fullstack-vertical-slice/files/AGENTS.md`
- Create: `templates/fullstack-vertical-slice/files/.github/workflows/verify.yml`
- Create: `templates/fullstack-vertical-slice/files/scripts/verify-learner.mjs`
- Create: `templates/fullstack-vertical-slice/files/.env.example`
- Modify: `templates/fullstack-vertical-slice/files/package.json`
- Create: `templates/fullstack-vertical-slice/files/evidence/README.md`
- Create: `templates/fullstack-vertical-slice/files/evidence/manifest.example.json`
- Create: `templates/fullstack-vertical-slice/acceptance/baseline.yaml`
- Create: `templates/fullstack-vertical-slice/publication-tests/expected-files.json`
- Modify: `fixtures/expected-failures.json`

**Interfaces:**
- Consumes: starter command contract, evidence schema, and publication pipeline
- Produces: publishable `template-fullstack-vertical-slice@0.1.0`

- [ ] **Step 1: Write the English learner README**

The README must state:

- Technical-preview status
- Exact prerequisites and commands
- Architecture map
- `verify:baseline` versus `verify`
- Which endpoints and UI workflows are deliberately incomplete
- Editable paths
- Evidence workflow
- Curriculum and template versions
- No claim of job readiness from this skeleton

- [ ] **Step 2: Write scoped Codex rules**

`AGENTS.md` permits:

- Explain and diagnose
- Add regression tests at learner request
- Review architecture and diff
- Run and report commands

It prohibits:

- Deleting or weakening learner tests
- Implementing the entire milestone directly from the brief
- Changing acceptance contracts
- Exposing environment secrets
- Claiming a command passed without running it
- Replacing PostgreSQL-specific verification with mocks when the criterion is database-specific

- [ ] **Step 3: Add a learner verifier that runs every declared incomplete seam before failing**

```js
// templates/fullstack-vertical-slice/files/scripts/verify-learner.mjs
import { spawnSync } from 'node:child_process';

const pnpmExecPath = process.env.npm_execpath;
if (!pnpmExecPath) {
  console.error('LEARNER_RUNNER_001: npm_execpath is unavailable; run this command through pnpm');
  process.exit(2);
}

const checks = [
  { name: 'api', args: ['--filter', '@workshop/api', 'test:learner'] },
  { name: 'web', args: ['--filter', '@workshop/web', 'test:learner'] },
];

let failed = false;
for (const check of checks) {
  const result = spawnSync(process.execPath, [pnpmExecPath, ...check.args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    shell: false,
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) {
    console.error(`LEARNER_RUNNER_002: ${check.name}: ${result.error.message}`);
    failed = true;
  } else if (result.status !== 0) {
    failed = true;
  }
}

process.exitCode = failed ? 1 : 0;
```

Modify the generated root scripts only after both learner test packages exist:

```json
{
  "scripts": {
    "test:learner": "node scripts/verify-learner.mjs",
    "test": "pnpm test:infrastructure && pnpm test:learner",
    "verify": "pnpm verify:baseline && pnpm test:learner"
  }
}
```

This runner must execute both learner suites even when the first fails, print both stable diagnostic codes on the untouched starter, and return `0` only after both contracts pass.

- [ ] **Step 4: Add read-only baseline and learner-contract CI**

```yaml
name: Verify

on:
  push:
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  baseline:
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify:baseline

  learner-contract:
    if: github.event_name != 'push'
    runs-on: ubuntu-24.04
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v6
        with:
          persist-credentials: false
      - uses: pnpm/action-setup@v6
        with:
          run_install: false
      - uses: actions/setup-node@v6
        with:
          node-version-file: .node-version
          cache: pnpm
          cache-dependency-path: pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

A repository created from the template therefore starts with a green baseline on its initial push. Pull requests and manual runs expose the intentionally incomplete learner contract until the learner implements it. Template publication still invokes `verify:baseline` directly.

- [ ] **Step 5: Add an evidence example that cannot be mistaken for real evidence**

Use clearly invalid example values such as:

```json
{
  "schemaVersion": 1,
  "curriculumVersion": "0.1.0",
  "templateVersion": "0.1.0",
  "milestoneId": "milestone-fullstack-vertical-slice",
  "repository": {
    "url": "https://github.com/replace-me/workshop-enrollment",
    "commit": "0000000000000000000000000000000000000000"
  },
  "attestations": [
    {
      "kind": "self-reported",
      "subject": "repository",
      "reference": "replace-me"
    }
  ]
}
```

Name the file `manifest.example.json`; the evidence validator must not scan it as a submitted manifest.

- [ ] **Step 6: Generate expected files and independent lockfile**

Run template source installation, then the publication dry run. Review every generated path and commit the sorted expected-file list.

- [ ] **Step 7: Prove baseline passes and learner verification fails for intended contracts**

Run the repository-owned publication command so the current Git commit and exact toolchain pins are discovered rather than copied into shell-specific variables:

```bash
pnpm verify:templates
```

The automated fullstack-template test must materialize to a test-owned temporary directory, then execute:

```text
pnpm install --frozen-lockfile
pnpm verify:baseline
pnpm verify
```

Assertions:

- Frozen install exits `0`
- `verify:baseline` exits `0`
- `verify` exits non-zero
- API learner failure names the unimplemented enrollment contract
- Browser learner failure names the absent authenticated enrollment workflow
- Neither learner failure is a missing dependency, configuration error, build error, or database connection attempt

- [ ] **Step 8: Commit**

```bash
git add templates/fullstack-vertical-slice fixtures/expected-failures.json
git commit -m "feat: publish vertical slice starter skeleton"
```

### Task 8: Turn Release 1 scope into an executable dependency-ordered backlog

**Files:**
- Create: `planning/release-1/backlog.yaml`
- Create: `planning/release-1/dependency-graph.md`
- Create: `planning/release-1/issue-contracts/*.md`
- Create: `planning/release-1/pilot-protocol.md`
- Create: `packages/release-plan-schema/package.json`
- Create: `packages/release-plan-schema/tsconfig.json`
- Create: `packages/release-plan-schema/vitest.config.ts`
- Create: `packages/release-plan-schema/src/schema.ts`
- Create: `packages/release-plan-schema/src/load.ts`
- Create: `packages/release-plan-schema/src/validate.ts`
- Create: `packages/release-plan-schema/src/index.ts`
- Create: `packages/release-plan-schema/test/backlog.test.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: module IDs, competency IDs, critical rubric criteria, the shared `Diagnostic`/`ValidationOutcome` contract, and the argv-shaped `CommandSpec` fields
- Produces: `ReleasePlanSchema`, `loadReleasePlan(filePath)`, `validateReleasePlan(plan, context)`, `ValidatedReleasePlan.topologicalOrder`, and machine-validated Release 1 issue contracts

- [ ] **Step 1: Create the package and write failing schema and semantic-validation tests**

```json
// packages/release-plan-schema/package.json
{
  "name": "@roadmap/release-plan-schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "check": "tsc --project tsconfig.json",
    "test": "vitest run --config vitest.config.ts"
  },
  "dependencies": {
    "@roadmap/validation-core": "workspace:*",
    "yaml": "catalog:",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```

```ts
// packages/release-plan-schema/test/backlog.test.ts
import { describe, expect, it } from 'vitest';
import {
  ReleasePlanSchema,
  validateReleasePlan,
  type ReleasePlan,
  type ReleasePlanValidationContext,
} from '../src/index.js';

const context: ReleasePlanValidationContext = {
  competencyIds: ['js.function.closure', 'db.transaction.atomic-enrollment'],
  moduleIds: ['module-javascript-essentials', 'module-postgresql-drizzle'],
  criterionIds: ['backend-authorization'],
  criticalCriteria: ['backend-authorization'],
};

const command = {
  command: 'pnpm',
  args: ['test'],
  cwd: '.',
  timeoutMs: 120_000,
};

const validPlan = (): ReleasePlan => ReleasePlanSchema.parse({
  schemaVersion: 1,
  releaseId: 'release-0-1-0',
  items: [
    {
      id: 'R1-CONTENT-JS-001',
      status: 'ready',
      lane: 'curriculum',
      risk: 'R1',
      objective: 'Write and validate the closure mental-model lesson',
      specReferences: ['curriculum/competencies/competency-js-function-closure.md'],
      dependsOn: [],
      files: ['curriculum/lessons/lesson-js-closure-private-state.md'],
      acceptance: [command],
      review: ['curriculum', 'testing'],
      evidence: ['executable-example-report'],
      openQuestions: [],
      coverage: {
        competencies: ['js.function.closure'],
        modules: [{ id: 'module-javascript-essentials', roles: ['content', 'assessment'] }],
        criteria: [],
      },
    },
    {
      id: 'R1-DB-002',
      status: 'ready',
      lane: 'database',
      risk: 'R4',
      objective: 'Implement and verify atomic enrollment authorization',
      specReferences: ['projects/milestones/workshop-enrollment/rubric/rubric.yaml'],
      dependsOn: ['R1-CONTENT-JS-001'],
      files: ['templates/fullstack-vertical-slice/files/apps/api/src/enrollment.ts'],
      acceptance: [command],
      review: ['architecture', 'security', 'testing'],
      evidence: ['transaction-integration-report'],
      openQuestions: [],
      coverage: {
        competencies: ['db.transaction.atomic-enrollment'],
        modules: [{ id: 'module-postgresql-drizzle', roles: ['content', 'assessment'] }],
        criteria: [{ id: 'backend-authorization', roles: ['implementation', 'test', 'remediation'] }],
      },
    },
  ],
});

describe('ReleasePlanSchema', () => {
  it('rejects shell strings, absolute paths, and ready items with open questions', () => {
    const invalid = structuredClone(validPlan());
    invalid.items[0]!.acceptance[0]!.command = 'pnpm test && rm -rf .';
    invalid.items[0]!.files = ['C:\\private\\answer.ts'];
    invalid.items[0]!.openQuestions = ['Which runtime should we use?'];
    expect(() => ReleasePlanSchema.parse(invalid)).toThrow();
  });
});

describe('validateReleasePlan', () => {
  it('returns a deterministic topological order for a complete plan', () => {
    const result = validateReleasePlan(validPlan(), context);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.topologicalOrder).toEqual(['R1-CONTENT-JS-001', 'R1-DB-002']);
      expect(result.value.coverage).toEqual({ competencies: 2, modules: 2, criticalCriteria: 1 });
    }
  });

  it.each([
    ['RELEASE_PLAN_ID_001', (plan: ReleasePlan) => { plan.items[1]!.id = plan.items[0]!.id; }],
    ['RELEASE_PLAN_DEPENDENCY_001', (plan: ReleasePlan) => { plan.items[1]!.dependsOn = ['R1-MISSING-001']; }],
    ['RELEASE_PLAN_CYCLE_001', (plan: ReleasePlan) => { plan.items[0]!.dependsOn = ['R1-DB-002']; }],
    ['RELEASE_PLAN_SCOPE_001', (plan: ReleasePlan) => { plan.items[0]!.objective = 'Finish Release 1'; }],
    ['RELEASE_PLAN_TRACEABILITY_001', (plan: ReleasePlan) => { plan.items[0]!.coverage.competencies = []; }],
    ['RELEASE_PLAN_MODULE_001', (plan: ReleasePlan) => { plan.items[0]!.coverage.modules[0]!.roles = ['content']; }],
    ['RELEASE_PLAN_CRITERION_001', (plan: ReleasePlan) => { plan.items[1]!.coverage.criteria[0]!.roles = ['implementation']; }],
  ])('emits %s for the exact invalid contract', (code, mutate) => {
    const plan = validPlan();
    mutate(plan);
    const result = validateReleasePlan(plan, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((entry) => entry.code)).toContain(code);
  });
});
```

- [ ] **Step 2: Run the focused tests and confirm the package implementation is missing**

```bash
pnpm --filter @roadmap/release-plan-schema test
```

Expected: FAIL because `src/index.ts` and the schemas do not exist.

- [ ] **Step 3: Implement the canonical schema, YAML loader, cycle detection, and traceability validator**

```ts
// packages/release-plan-schema/src/schema.ts
import path from 'node:path';
import { z } from 'zod';

const safeRepositoryPath = z.string().min(1).superRefine((value, context) => {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.split(/[\\/]/).includes('..')) {
    context.addIssue({ code: 'custom', message: 'Path must be repository-relative and contained' });
  }
});

const commandName = z.string().min(1).refine(
  (value) => !/[;&|`$<>\r\n]/.test(value),
  'Command must be one executable name without shell syntax',
);

export const ReleasePlanCommandSchema = z.object({
  command: commandName,
  args: z.array(z.string()),
  cwd: safeRepositoryPath,
  timeoutMs: z.number().int().positive().max(1_800_000),
}).strict();

export const WorkLaneSchema = z.enum([
  'governance',
  'engineering',
  'curriculum',
  'exercise',
  'frontend',
  'backend',
  'database',
  'fullstack',
  'assessment',
  'pilot',
]);

export const WorkRiskSchema = z.enum(['R0', 'R1', 'R2', 'R3', 'R4']);
export const ReviewKindSchema = z.enum(['architecture', 'curriculum', 'testing', 'security', 'release']);
export const CoverageRoleSchema = z.enum(['content', 'assessment', 'implementation', 'test', 'remediation']);

const coverageTarget = z.object({
  id: z.string().min(1),
  roles: z.array(CoverageRoleSchema).min(1),
}).strict();

export const ReleasePlanItemSchema = z.object({
  id: z.string().regex(/^R1-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/),
  status: z.enum(['proposed', 'ready', 'in-progress', 'blocked', 'implemented', 'verified', 'merged', 'withdrawn']),
  lane: WorkLaneSchema,
  risk: WorkRiskSchema,
  objective: z.string().min(12),
  specReferences: z.array(safeRepositoryPath).min(1),
  dependsOn: z.array(z.string().regex(/^R1-[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/)),
  files: z.array(safeRepositoryPath).min(1),
  acceptance: z.array(ReleasePlanCommandSchema).min(1),
  review: z.array(ReviewKindSchema).min(1),
  evidence: z.array(z.string().min(1)).min(1),
  openQuestions: z.array(z.string().min(1)),
  coverage: z.object({
    competencies: z.array(z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/)),
    modules: z.array(coverageTarget),
    criteria: z.array(coverageTarget),
  }).strict(),
}).strict().superRefine((item, context) => {
  if (item.status === 'ready' && item.openQuestions.length > 0) {
    context.addIssue({ code: 'custom', path: ['openQuestions'], message: 'Ready items have no unresolved questions' });
  }
  if (item.risk === 'R3' && !item.review.includes('architecture')) {
    context.addIssue({ code: 'custom', path: ['review'], message: 'R3 requires architecture review' });
  }
  if (item.risk === 'R4' && !item.review.includes('security')) {
    context.addIssue({ code: 'custom', path: ['review'], message: 'R4 requires security review' });
  }
});

export const ReleasePlanSchema = z.object({
  schemaVersion: z.literal(1),
  releaseId: z.string().regex(/^release-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  items: z.array(ReleasePlanItemSchema).min(1),
}).strict();

export type ReleasePlan = z.infer<typeof ReleasePlanSchema>;
export type ReleasePlanItem = z.infer<typeof ReleasePlanItemSchema>;
```

```ts
// packages/release-plan-schema/src/load.ts
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { failure, success, type Diagnostic, type ValidationOutcome } from '@roadmap/validation-core';
import { ReleasePlanSchema, type ReleasePlan } from './schema.js';

export async function loadReleasePlan(filePath: string): Promise<ValidationOutcome<ReleasePlan>> {
  try {
    const parsed: unknown = YAML.parse(await readFile(filePath, 'utf8'));
    const result = ReleasePlanSchema.safeParse(parsed);
    if (result.success) return success(result.data);
    const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
      code: 'RELEASE_PLAN_SCHEMA_001',
      severity: 'error',
      location: { file: filePath, pointer: issue.path.join('.') },
      observed: issue.input,
      expected: issue.message,
      reason: 'Release plan metadata does not satisfy the canonical contract',
      remediation: 'Correct the named backlog field and rerun release-plan validation',
      documentation: 'planning/release-1/dependency-graph.md',
    }));
    return failure(diagnostics);
  } catch (error) {
    return failure([{
      code: 'RELEASE_PLAN_PARSE_001',
      severity: 'error',
      location: { file: filePath },
      observed: error instanceof Error ? error.message : String(error),
      expected: 'UTF-8 YAML satisfying ReleasePlanSchema',
      reason: 'The Release 1 backlog could not be parsed',
      remediation: 'Repair the YAML syntax and rerun release-plan validation',
      documentation: 'planning/release-1/dependency-graph.md',
    }]);
  }
}
```

```ts
// packages/release-plan-schema/src/validate.ts
import { failure, success, type Diagnostic, type ValidationOutcome } from '@roadmap/validation-core';
import type { ReleasePlan } from './schema.js';

export interface ReleasePlanValidationContext {
  competencyIds: readonly string[];
  moduleIds: readonly string[];
  criterionIds: readonly string[];
  criticalCriteria: readonly string[];
}

export interface ValidatedReleasePlan {
  plan: ReleasePlan;
  topologicalOrder: readonly string[];
  coverage: { competencies: number; modules: number; criticalCriteria: number };
}

function issue(code: string, observed: unknown, expected: string, reason: string): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: 'planning/release-1/backlog.yaml' },
    observed,
    expected,
    reason,
    remediation: 'Correct the Release 1 backlog and rerun @roadmap/release-plan-schema tests',
    documentation: 'planning/release-1/dependency-graph.md',
  };
}

function topologicalOrder(plan: ReleasePlan): { order: string[]; unresolved: string[] } {
  const byId = new Map(plan.items.map((item) => [item.id, item]));
  const indegree = new Map(plan.items.map((item) => [item.id, 0]));
  const outgoing = new Map(plan.items.map((item) => [item.id, [] as string[]]));
  for (const item of plan.items) {
    for (const dependency of item.dependsOn) {
      if (!byId.has(dependency)) continue;
      indegree.set(item.id, (indegree.get(item.id) ?? 0) + 1);
      outgoing.get(dependency)!.push(item.id);
    }
  }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id).sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    order.push(id);
    for (const target of outgoing.get(id)!.sort()) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  return { order, unresolved: [...indegree].filter(([, count]) => count > 0).map(([id]) => id).sort() };
}

export function validateReleasePlan(
  plan: ReleasePlan,
  context: ReleasePlanValidationContext,
): ValidationOutcome<ValidatedReleasePlan> {
  const diagnostics: Diagnostic[] = [];
  const ids = plan.items.map((item) => item.id);
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  if (duplicateIds.length > 0) diagnostics.push(issue('RELEASE_PLAN_ID_001', duplicateIds, 'Unique work-item IDs', 'Duplicate IDs make evidence and dependency references ambiguous'));

  const known = new Set(ids);
  const missingDependencies = plan.items.flatMap((item) => item.dependsOn.filter((id) => !known.has(id)).map((id) => `${item.id}->${id}`)).sort();
  if (missingDependencies.length > 0) diagnostics.push(issue('RELEASE_PLAN_DEPENDENCY_001', missingDependencies, 'Every dependency resolves', 'One or more work items depend on missing IDs'));

  const sorted = topologicalOrder(plan);
  if (sorted.unresolved.length > 0) diagnostics.push(issue('RELEASE_PLAN_CYCLE_001', sorted.unresolved, 'Acyclic dependency graph', 'The backlog contains a dependency cycle'));

  const unbounded = plan.items.filter((item) => /^(?:finish|complete|build|improve)\s+(?:all\s+)?release\s+1\b|production-ready|entire curriculum/i.test(item.objective)).map((item) => item.id);
  if (unbounded.length > 0) diagnostics.push(issue('RELEASE_PLAN_SCOPE_001', unbounded, 'One bounded, reviewable outcome per item', 'One or more objectives are too broad to verify independently'));

  const coveredCompetencies = new Set(plan.items.flatMap((item) => item.coverage.competencies));
  const unknownCompetencies = [...coveredCompetencies].filter((id) => !context.competencyIds.includes(id)).sort();
  const missingCompetencies = context.competencyIds.filter((id) => !coveredCompetencies.has(id)).sort();
  if (unknownCompetencies.length > 0 || missingCompetencies.length > 0) diagnostics.push(issue('RELEASE_PLAN_TRACEABILITY_001', { unknownCompetencies, missingCompetencies }, 'Every Release 1 competency is covered exactly by known IDs', 'Competency-to-work traceability is incomplete or references unknown IDs'));

  const moduleRoles = new Map<string, Set<string>>();
  for (const target of plan.items.flatMap((item) => item.coverage.modules)) {
    const roles = moduleRoles.get(target.id) ?? new Set<string>();
    target.roles.forEach((role) => roles.add(role));
    moduleRoles.set(target.id, roles);
  }
  const invalidModules = context.moduleIds.filter((id) => {
    const roles = moduleRoles.get(id);
    return !roles?.has('content') || !roles.has('assessment');
  });
  const unknownModules = [...moduleRoles.keys()].filter((id) => !context.moduleIds.includes(id)).sort();
  if (invalidModules.length > 0 || unknownModules.length > 0) diagnostics.push(issue('RELEASE_PLAN_MODULE_001', { invalidModules, unknownModules }, 'Every known module has content and assessment work', 'Module coverage is incomplete or references an unknown module'));

  const criterionRoles = new Map<string, Set<string>>();
  for (const target of plan.items.flatMap((item) => item.coverage.criteria)) {
    const roles = criterionRoles.get(target.id) ?? new Set<string>();
    target.roles.forEach((role) => roles.add(role));
    criterionRoles.set(target.id, roles);
  }
  const requiredRoles = ['implementation', 'test', 'remediation'];
  const invalidCriteria = context.criticalCriteria.filter((id) => requiredRoles.some((role) => !criterionRoles.get(id)?.has(role)));
  const unknownCriteria = [...criterionRoles.keys()].filter((id) => !context.criterionIds.includes(id)).sort();
  if (invalidCriteria.length > 0 || unknownCriteria.length > 0) diagnostics.push(issue('RELEASE_PLAN_CRITERION_001', { invalidCriteria, unknownCriteria }, 'Every critical criterion has implementation, test, and remediation work', 'Critical quality-gate traceability is incomplete or unknown'));

  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    plan,
    topologicalOrder: sorted.order,
    coverage: {
      competencies: context.competencyIds.length,
      modules: context.moduleIds.length,
      criticalCriteria: context.criticalCriteria.length,
    },
  });
}
```

```ts
// packages/release-plan-schema/src/index.ts
export * from './load.js';
export * from './schema.js';
export * from './validate.js';
```

- [ ] **Step 4: Author the real Release 1 backlog, issue contracts, dependency graph, and pilot protocol**

The backlog root is:

```yaml
schemaVersion: 1
releaseId: release-0-1-0
items:
  - id: R1-CONTENT-JS-001
    status: ready
    lane: curriculum
    risk: R1
    objective: Write and validate the closure mental-model lesson and executable examples
    specReferences:
      - curriculum/competencies/competency-js-function-closure.md
    dependsOn:
      - R1-EXERCISE-JS-001
    files:
      - curriculum/lessons/lesson-js-closure-private-state.md
    acceptance:
      - command: pnpm
        args: [content:validate, curriculum, --format, json]
        cwd: .
        timeoutMs: 120000
      - command: pnpm
        args: [test]
        cwd: .
        timeoutMs: 300000
    review: [curriculum, testing]
    evidence: [executable-example-report, assessment-alignment-review]
    openQuestions: []
    coverage:
      competencies: [js.function.closure]
      modules:
        - id: module-javascript-essentials
          roles: [content]
      criteria: []
```

Create bounded work items in these groups:

```text
R1-GOV        Decision and authoring contracts
R1-CONTENT    Nine module content sequences
R1-EXERCISE   Focused exercises and laboratories
R1-WEB        React learner workflow
R1-API        Express authentication and enrollment workflow
R1-DB         Migrations, constraints, transaction, and concurrency tests
R1-FULLSTACK  Contracts, errors, duplicate submission, and deployment
R1-ASSESS     Rubric, evidence, remediation, and change request
R1-PILOT      Independent learner dry run
```

Every competency from Task 2 appears in `coverage.competencies`. Every module has at least one `content` and one `assessment` role. Every critical Workshop Enrollment rubric criterion has `implementation`, `test`, and `remediation` roles. No item may use a shell command string.

Create complete issue contracts for:

```text
R1-EXERCISE-JS-001     Event-loop mechanism laboratory
R1-CONTENT-JS-001      Closure lesson
R1-WEB-001             Workshop list server-state workflow
R1-API-001             Runtime request/response boundary
R1-DB-001              Initial Drizzle migration
R1-SEC-001             Session creation, storage, and revocation
R1-DB-002              Atomic enrollment transaction
R1-FULLSTACK-001       Duplicate-submission incident
```

Each issue document contains Objective, Context, In scope, Out of scope, Allowed boundaries, Required behavior, Failure behavior, Acceptance criteria, Commands, Evidence, Constraints, and Open questions. A `ready` item uses `Open questions: None`.

`planning/release-1/pilot-protocol.md` requires a target learner who knows C++, Python, or Java but lacks fullstack experience, a fresh clone on a supported OS, no undocumented maintainer intervention, a blocker log, hint-level usage, a complete evidence package, a short technical explanation, and post-completion review. Release 1 cannot move from `experimental` to `validated` without one complete pilot run.

- [ ] **Step 5: Validate the real backlog and commit**

Add one test that loads `planning/release-1/backlog.yaml`, derives context from the nineteen competencies, nine modules, and critical rubric criteria, then asserts a nonempty topological order and complete traceability.

Run:

```bash
pnpm --filter @roadmap/release-plan-schema check
pnpm --filter @roadmap/release-plan-schema test
pnpm check
pnpm test
```

Expected:

- Schema and all seven semantic diagnostic tests pass
- Real backlog has no duplicate, missing, or cyclic dependency
- Every competency, module, and critical criterion is covered
- Every `ready` item has no unresolved question
- No work item has an unbounded objective

Commit:

```bash
git add planning/release-1 packages/release-plan-schema pnpm-workspace.yaml vitest.config.ts pnpm-lock.yaml
git commit -m "plan: define executable Release 1 backlog"
```


### Task 9: Add the final WP-10 and Release 0 completion gate

**Files:**
- Create: `scripts/verify-wp10-skeleton.ts`
- Create: `scripts/verify-wp10-skeleton.test.ts`
- Modify: `scripts/verify-release-0.mjs`
- Modify: `scripts/ci/collect-release-evidence.mjs`
- Modify: `docs/architecture/release-0-evidence.md`
- Modify: `package.json`
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: validated curriculum corpus and graph, accepted ADRs, Workshop Enrollment rubric and remediation, validated Release 1 backlog, and a generated fullstack-template baseline/learner probe
- Produces: `evaluateWp10Skeleton(input)`, `verifyWp10Repository(root)`, `pnpm verify:wp10`, three WP-10 evidence records, and the final same-commit Release 0 decision artifact

- [ ] **Step 1: Define a pure input contract and write one failing test per diagnostic**

```ts
// scripts/verify-wp10-skeleton.test.ts
import { describe, expect, it } from 'vitest';
import { evaluateWp10Skeleton, type Wp10SkeletonInput } from './verify-wp10-skeleton.js';

const validInput = (): Wp10SkeletonInput => ({
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  release: {
    id: 'release-0-1-0',
    status: 'review',
    maturity: 'experimental',
    claims: ['Repository kernel and reference path structure are implemented'],
  },
  trackId: 'track-core-vertical-slice',
  competencies: Array.from({ length: 19 }, (_, index) => `competency.${index}`),
  modules: Array.from({ length: 9 }, (_, index) => ({ id: `module-${index}`, body: `## Problem\nMeaningful body ${index}` })),
  gates: Array.from({ length: 7 }, (_, index) => `gate-${index}`),
  backlog: {
    items: Array.from({ length: 19 }, (_, index) => ({
      id: `R1-${index}`,
      competencies: [`competency.${index}`],
    })),
  },
  decisions: [
    { id: '0002-reference-authentication', status: 'Accepted for the Release 1 reference stack' },
    { id: '0003-workshop-enrollment-boundaries', status: 'Accepted for the Release 1 reference stack' },
    { id: '0004-reference-deployment-shape', status: 'Accepted for the Release 1 reference stack' },
  ],
  remediation: { missingBlockingCriteria: [] },
  template: {
    id: 'template-fullstack-vertical-slice',
    version: '0.1.0',
    baselineStatus: 'passed',
    learnerStatus: 'expected-failure',
    learnerDiagnostics: ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'],
  },
});

const cases = [
  ['WP10_RELEASE_CLAIM_001', (input: Wp10SkeletonInput) => input.release.claims.push('Junior Fullstack readiness')],
  ['WP10_CONTENT_001', (input: Wp10SkeletonInput) => { input.modules[0]!.body = '# Heading only'; }],
  ['WP10_TRACEABILITY_001', (input: Wp10SkeletonInput) => { input.backlog.items = input.backlog.items.slice(1); }],
  ['WP10_TEMPLATE_BASELINE_001', (input: Wp10SkeletonInput) => { input.template.baselineStatus = 'failed'; }],
  ['WP10_TEMPLATE_LEARNER_001', (input: Wp10SkeletonInput) => { input.template.learnerStatus = 'passed'; }],
  ['WP10_DECISION_001', (input: Wp10SkeletonInput) => { input.decisions[0]!.status = 'Proposed'; }],
  ['WP10_REMEDIATION_001', (input: Wp10SkeletonInput) => { input.remediation.missingBlockingCriteria = ['backend-authorization']; }],
] as const;

describe.each(cases)('%s', (code, mutate) => {
  it('fails with the exact diagnostic', () => {
    const input = validInput();
    mutate(input);
    const result = evaluateWp10Skeleton(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.map((entry) => entry.code)).toContain(code);
  });
});

it('accepts only the exact bounded skeleton contract', () => {
  const result = evaluateWp10Skeleton(validInput());
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value).toMatchObject({
      status: 'passed',
      competencies: 19,
      modules: 9,
      gates: 7,
      backlogItems: 19,
    });
  }
});
```

- [ ] **Step 2: Run the tests and confirm the evaluator is missing**

```bash
pnpm exec vitest run scripts/verify-wp10-skeleton.test.ts
```

Expected: FAIL because `verify-wp10-skeleton.ts` does not exist.

- [ ] **Step 3: Implement the pure evaluator with stable diagnostics**

```ts
// scripts/verify-wp10-skeleton.ts
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { RemediationCatalogSchema, validateRemediationCoverage } from '@roadmap/assessment-core';
import { runCommand } from '@roadmap/command-runner';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { CompetencySchema, GateSchema, ModuleSchema, ReleaseSchema, TrackSchema } from '@roadmap/curriculum-schema';
import { loadReleasePlan, validateReleasePlan } from '@roadmap/release-plan-schema';
import { RubricSchema } from '@roadmap/rubric-schema';
import { failure, success, type Diagnostic, type ValidationOutcome } from '@roadmap/validation-core';
import { runTemplateDryRun } from '@roadmap/publish-templates';

export interface Wp10SkeletonInput {
  sourceCommit: string;
  release: { id: string; status: string; maturity: string; claims: string[] };
  trackId: string;
  competencies: string[];
  modules: Array<{ id: string; body: string }>;
  gates: string[];
  backlog: { items: Array<{ id: string; competencies: string[] }> };
  decisions: Array<{ id: string; status: string }>;
  remediation: { missingBlockingCriteria: string[] };
  template: {
    id: string;
    version: string;
    baselineStatus: 'passed' | 'failed';
    learnerStatus: 'expected-failure' | 'passed' | 'unexpected-failure';
    learnerDiagnostics: string[];
  };
}

export interface Wp10SkeletonReport {
  schemaVersion: 1;
  status: 'passed';
  release: '0.1.0-skeleton';
  track: 'track-core-vertical-slice';
  template: 'template-fullstack-vertical-slice@0.1.0';
  competencies: number;
  modules: number;
  gates: number;
  backlogItems: number;
  sourceCommit: string;
}

function diagnostic(code: string, reason: string, observed: unknown, expected: string): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: '<wp10-skeleton>' },
    observed,
    expected,
    reason,
    remediation: 'Correct the referenced WP-10 contract and rerun pnpm verify:wp10',
    documentation: 'docs/architecture/release-0-evidence.md',
  };
}

export function evaluateWp10Skeleton(input: Wp10SkeletonInput): ValidationOutcome<Wp10SkeletonReport> {
  const diagnostics: Diagnostic[] = [];
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit)
      || input.release.id !== 'release-0-1-0'
      || input.release.status !== 'review'
      || input.release.maturity !== 'experimental'
      || input.release.claims.some((claim) => /junior fullstack readiness|complete self-study|stable curriculum/i.test(claim))) {
    diagnostics.push(diagnostic('WP10_RELEASE_CLAIM_001', 'Release 0 overstates Release 1 completion', input.release, 'Review-only experimental skeleton claims'));
  }
  const invalidModules = input.modules.filter(({ body }) => {
    const prose = body.replace(/^#{1,6}\s+.*$/gm, '').trim();
    return prose.length < 40 || /^(?:placeholder|coming soon|incomplete)$/i.test(prose);
  }).map(({ id }) => id);
  if (invalidModules.length > 0) {
    diagnostics.push(diagnostic('WP10_CONTENT_001', 'One or more modules contain no meaningful technical-preview body', invalidModules, 'Nine nonempty modules'));
  }
  const covered = new Set(input.backlog.items.flatMap((item) => item.competencies));
  const missingCompetencies = input.competencies.filter((id) => !covered.has(id));
  if (input.trackId !== 'track-core-vertical-slice'
      || input.competencies.length !== 19 || input.modules.length !== 9 || input.gates.length !== 7
      || input.backlog.items.length === 0 || missingCompetencies.length > 0) {
    diagnostics.push(diagnostic('WP10_TRACEABILITY_001', 'Skeleton counts or backlog traceability do not match the approved contract', {
      competencies: input.competencies.length,
      modules: input.modules.length,
      gates: input.gates.length,
      backlogItems: input.backlog.items.length,
      missingCompetencies,
    }, '19 competencies, 9 modules, 7 gates, and positive backlog coverage'));
  }
  if (input.template.id !== 'template-fullstack-vertical-slice'
      || input.template.version !== '0.1.0'
      || input.template.baselineStatus !== 'passed') {
    diagnostics.push(diagnostic('WP10_TEMPLATE_BASELINE_001', 'Generated starter baseline is unhealthy', input.template.baselineStatus, 'passed'));
  }
  const expectedLearnerCodes = ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'];
  if (input.template.learnerStatus !== 'expected-failure'
      || !expectedLearnerCodes.every((code) => input.template.learnerDiagnostics.includes(code))) {
    diagnostics.push(diagnostic('WP10_TEMPLATE_LEARNER_001', 'Learner verification does not fail only at the declared incomplete seams', input.template, 'Expected API and web enrollment failures'));
  }
  const requiredDecisions = new Set([
    '0002-reference-authentication',
    '0003-workshop-enrollment-boundaries',
    '0004-reference-deployment-shape',
  ]);
  const accepted = new Set(input.decisions.filter(({ status }) => status.startsWith('Accepted')).map(({ id }) => id));
  const missingDecisions = [...requiredDecisions].filter((id) => !accepted.has(id));
  if (missingDecisions.length > 0) {
    diagnostics.push(diagnostic('WP10_DECISION_001', 'Required reference decisions are missing or not accepted', missingDecisions, 'All three accepted ADRs'));
  }
  if (input.remediation.missingBlockingCriteria.length > 0) {
    diagnostics.push(diagnostic('WP10_REMEDIATION_001', 'Blocking rubric criteria lack remediation', input.remediation.missingBlockingCriteria, 'Complete blocking-criterion coverage'));
  }
  if (diagnostics.length > 0) return failure(diagnostics);
  return success({
    schemaVersion: 1,
    status: 'passed',
    release: '0.1.0-skeleton',
    track: 'track-core-vertical-slice',
    template: 'template-fullstack-vertical-slice@0.1.0',
    competencies: input.competencies.length,
    modules: input.modules.length,
    gates: input.gates.length,
    backlogItems: input.backlog.items.length,
    sourceCommit: input.sourceCommit,
  });
}
```

- [ ] **Step 4: Implement the repository adapter and intentional learner probe**

Add the repository-level result types and helpers below the pure evaluator:

```ts
export interface Wp10RepositoryReport {
  skeleton: Wp10SkeletonReport;
  backlog: {
    schemaVersion: 1;
    status: 'passed';
    sourceCommit: string;
    items: number;
    cycles: 0;
    topologicalOrder: readonly string[];
  };
  template: {
    schemaVersion: 1;
    status: 'passed';
    sourceCommit: string;
    templateId: 'template-fullstack-vertical-slice';
    baselineStatus: 'passed';
    learnerStatus: 'expected-failure';
    learnerDiagnostics: readonly ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'];
  };
}

async function readDecisionStatus(root: string, id: string): Promise<{ id: string; status: string }> {
  const filePath = path.join(root, 'docs', 'decisions', `${id}.md`);
  const source = await readFile(filePath, 'utf8');
  const match = /^\*\*Status:\*\*\s+(.+)$/m.exec(source);
  if (!match) throw new Error(`Decision status is missing: ${filePath}`);
  return { id, status: match[1]!.trim() };
}

function unwrap<T>(outcome: ValidationOutcome<T>): T {
  if (!outcome.ok) {
    const error = new Error('A prerequisite WP-10 validation failed');
    Object.assign(error, { diagnostics: outcome.diagnostics });
    throw error;
  }
  return outcome.value;
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function classifyLearnerProbe(result: Awaited<ReturnType<typeof runCommand>>) {
  const output = `${result.stdout}\n${result.stderr}`;
  const expected = ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'] as const;
  const diagnostics = expected.filter((code) => output.includes(code));
  const infrastructureFailure = /ERR_MODULE_NOT_FOUND|Cannot find module|DATABASE_URL|ECONNREFUSED|LEARNER_RUNNER_00[12]/i.test(output);
  if (result.exitCode === 0) return { status: 'passed' as const, diagnostics };
  if (!infrastructureFailure && diagnostics.length === expected.length) {
    return { status: 'expected-failure' as const, diagnostics: [...expected] };
  }
  return { status: 'unexpected-failure' as const, diagnostics };
}
```

Use the canonical schemas instead of unchecked casts when selecting curriculum entities, and implement the adapter exactly as follows:

```ts
export async function verifyWp10Repository(
  root = process.cwd(),
): Promise<ValidationOutcome<Wp10RepositoryReport>> {
  try {
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();

    const corpus = unwrap(await loadCurriculum(path.join(root, 'curriculum')));
    const graph = unwrap(buildCurriculumGraph(corpus));
    unwrap(validateCurriculumGraph(graph));

    const getDocument = (id: string) => {
      const document = graph.nodes.get(id);
      if (!document) throw new Error(`Missing validated curriculum entity: ${id}`);
      return document;
    };

    const releaseDocument = getDocument('release-0-1-0');
    const release = ReleaseSchema.parse(releaseDocument.data);
    const track = TrackSchema.parse(getDocument('track-core-vertical-slice').data);
    const competencies = track.requiredCompetencies.map((id) => CompetencySchema.parse(getDocument(id).data));
    const modules = track.modules.map((id) => {
      const document = getDocument(id);
      const data = ModuleSchema.parse(document.data);
      return { id: data.id, body: document.body };
    });
    const gates = track.gates.map((id) => GateSchema.parse(getDocument(id).data));

    const rubricPath = path.join(root, 'projects', 'milestones', 'workshop-enrollment', 'rubric', 'rubric.yaml');
    const remediationPath = path.join(root, 'projects', 'milestones', 'workshop-enrollment', 'remediation', 'catalog.yaml');
    const rubric = RubricSchema.parse(YAML.parse(await readFile(rubricPath, 'utf8')));
    const remediation = RemediationCatalogSchema.parse(YAML.parse(await readFile(remediationPath, 'utf8')));
    const remediationOutcome = validateRemediationCoverage(rubric, remediation);
    const missingBlockingCriteria = remediationOutcome.ok
      ? []
      : remediationOutcome.diagnostics.map((entry) => String(entry.observed)).sort();

    const loadedPlan = unwrap(await loadReleasePlan(path.join(root, 'planning', 'release-1', 'backlog.yaml')));
    const validatedPlan = unwrap(validateReleasePlan(loadedPlan, {
      competencyIds: track.requiredCompetencies,
      moduleIds: track.modules,
      criterionIds: rubric.criteria.map((criterion) => criterion.id),
      criticalCriteria: rubric.criteria.filter((criterion) => criterion.critical).map((criterion) => criterion.id),
    }));

    const decisions = await Promise.all([
      readDecisionStatus(root, '0002-reference-authentication'),
      readDecisionStatus(root, '0003-workshop-enrollment-boundaries'),
      readDecisionStatus(root, '0004-reference-deployment-shape'),
    ]);

    const nodeVersion = (await readFile(path.join(root, '.node-version'), 'utf8')).trim().replace(/^v/, '');
    const pnpmVersion = (await readFile(path.join(root, '.pnpm-version'), 'utf8')).trim();
    const outputRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-wp10-template-'));
    const dryRun = await runTemplateDryRun({
      templateRoot: path.join(root, 'templates', 'fullstack-vertical-slice'),
      outputRoot,
      sourceRepository: 'fullstack-javascript-roadmap',
      sourceCommit,
      generatedAt: new Date().toISOString(),
      nodeVersion,
      pnpmVersion,
    });

    let learnerStatus: Wp10SkeletonInput['template']['learnerStatus'] = 'unexpected-failure';
    let learnerDiagnostics: string[] = [];
    if (dryRun.status === 'passed' && dryRun.artifact) {
      const learnerProbe = classifyLearnerProbe(await runCommand({
        command: pnpmCommand(),
        args: ['verify'],
        cwd: dryRun.artifact.root,
        timeoutMs: 300_000,
      }));
      learnerStatus = learnerProbe.status;
      learnerDiagnostics = [...learnerProbe.diagnostics];
    }

    const evaluated = evaluateWp10Skeleton({
      sourceCommit,
      release: {
        id: release.id,
        status: release.status,
        maturity: release.maturity,
        claims: release.claims,
      },
      trackId: track.id,
      competencies: competencies.map(({ id }) => id),
      modules,
      gates: gates.map(({ id }) => id),
      backlog: {
        items: validatedPlan.plan.items.map((item) => ({
          id: item.id,
          competencies: item.coverage.competencies,
        })),
      },
      decisions,
      remediation: { missingBlockingCriteria },
      template: {
        id: 'template-fullstack-vertical-slice',
        version: '0.1.0',
        baselineStatus: dryRun.status === 'passed' ? 'passed' : 'failed',
        learnerStatus,
        learnerDiagnostics,
      },
    });
    if (!evaluated.ok) return evaluated;

    const report: Wp10RepositoryReport = {
      skeleton: evaluated.value,
      backlog: {
        schemaVersion: 1,
        status: 'passed',
        sourceCommit,
        items: validatedPlan.plan.items.length,
        cycles: 0,
        topologicalOrder: validatedPlan.topologicalOrder,
      },
      template: {
        schemaVersion: 1,
        status: 'passed',
        sourceCommit,
        templateId: 'template-fullstack-vertical-slice',
        baselineStatus: 'passed',
        learnerStatus: 'expected-failure',
        learnerDiagnostics: ['LEARNER_API_ENROLLMENT_001', 'LEARNER_WEB_ENROLLMENT_001'],
      },
    };

    const reportDir = path.join(root, '.tmp', 'reports', 'wp10');
    await mkdir(reportDir, { recursive: true });
    await Promise.all([
      writeFile(path.join(reportDir, 'vertical-slice-skeleton.json'), `${JSON.stringify(report.skeleton, null, 2)}\n`, 'utf8'),
      writeFile(path.join(reportDir, 'release-1-backlog.json'), `${JSON.stringify(report.backlog, null, 2)}\n`, 'utf8'),
      writeFile(path.join(reportDir, 'fullstack-template.json'), `${JSON.stringify(report.template, null, 2)}\n`, 'utf8'),
    ]);
    return success(report);
  } catch (error) {
    const carried = error instanceof Error && 'diagnostics' in error
      ? (error as Error & { diagnostics: readonly Diagnostic[] }).diagnostics
      : undefined;
    return carried
      ? failure(carried)
      : failure([diagnostic(
          'WP10_INTERNAL_001',
          'The repository adapter crashed before producing trustworthy evidence',
          error instanceof Error ? error.message : String(error),
          'All prerequisite validators and probes complete without throwing',
        )]);
  }
}
```

The three reports are therefore concrete runtime objects, not hand-edited examples:

```text
.tmp/reports/wp10/vertical-slice-skeleton.json
└── Wp10SkeletonReport

.tmp/reports/wp10/release-1-backlog.json
└── actual item count, topological order, zero cycles, current commit

.tmp/reports/wp10/fullstack-template.json
└── passed baseline and exactly two declared learner failures, current commit
```

Add the direct-entry adapter:

```ts
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invoked === fileURLToPath(import.meta.url)) {
  const result = await verifyWp10Repository();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
```


- [ ] **Step 5: Wire the root command and run evaluator tests**

Add these root workspace dependencies so the repository script resolves only declared packages:

```json
{
  "devDependencies": {
    "@roadmap/assessment-core": "workspace:*",
    "@roadmap/command-runner": "workspace:*",
    "@roadmap/curriculum-graph": "workspace:*",
    "@roadmap/curriculum-loader": "workspace:*",
    "@roadmap/curriculum-schema": "workspace:*",
    "@roadmap/publish-templates": "workspace:*",
    "@roadmap/release-plan-schema": "workspace:*",
    "@roadmap/rubric-schema": "workspace:*",
    "@roadmap/validation-core": "workspace:*"
  }
}
```

```json
{
  "scripts": {
    "verify:wp10": "tsx scripts/verify-wp10-skeleton.ts",
    "verify:release": "node scripts/run-pipeline.mjs environment:verify check test content:validate:curriculum docs:build verify:negative-fixtures verify:templates verify:wp10"
  }
}
```

Add `scripts/verify-wp10-skeleton.test.ts` to the root Vitest project, then run:

```bash
pnpm exec vitest run scripts/verify-wp10-skeleton.test.ts
pnpm verify:wp10
```

Expected: eight evaluator tests pass and the repository adapter writes all three WP-10 reports.

- [ ] **Step 6: Extend aggregate collection and the final Release 0 required set**

In `scripts/ci/collect-release-evidence.mjs`, add Ubuntu artifact inputs:

```js
wp10Skeleton: `${downloaded}/ubuntu/wp10/vertical-slice-skeleton.json`,
wp10Backlog: `${downloaded}/ubuntu/wp10/release-1-backlog.json`,
wp10Template: `${downloaded}/ubuntu/wp10/fullstack-template.json`,
```

Validate their `status` and `sourceCommit` in the existing input loop, then add copy mappings:

```js
{ source: inputFiles.wp10Skeleton, target: 'wp10/vertical-slice-skeleton.json' },
{ source: inputFiles.wp10Backlog, target: 'wp10/release-1-backlog.json' },
{ source: inputFiles.wp10Template, target: 'wp10/fullstack-template.json' },
```

Append the same three target paths to `requiredEvidence` in `scripts/verify-release-0.mjs`. The existing release-evidence tests must automatically include and hash them through the exported `requiredEvidence` list.

- [ ] **Step 7: Update the evidence index and run the full local gate**

Add these rows to `docs/architecture/release-0-evidence.md`:

| Evidence | Producer | Meaning |
|---|---|---|
| `wp10/vertical-slice-skeleton.json` | `pnpm verify:wp10` | bounded curriculum and decision contract passed |
| `wp10/release-1-backlog.json` | `pnpm verify:wp10` | backlog is positive, acyclic, and competency-traceable |
| `wp10/fullstack-template.json` | `pnpm verify:wp10` | baseline passed and only declared learner seams failed |

Run:

```bash
pnpm install --frozen-lockfile
pnpm verify
pnpm verify:negative-fixtures
pnpm verify:templates
pnpm verify:wp10
pnpm verify:release
node --test scripts/ci/tests/release-evidence.test.mjs
```

Expected:

- Every command exits `0`
- Generated fullstack baseline passes
- Learner probe exits non-zero with both declared learner diagnostics
- The three WP-10 records use the current 40-hex commit
- The Release 0 gate requires and hashes all five spike, two platform, browser, negative-fixture, template, and WP-10 records

- [ ] **Step 8: Complete independent reviews and commit**

Required review gates:

```text
Architecture reviewer
└── Package boundaries and dependency direction

Curriculum reviewer
└── Competency ordering, module substance, and completion claims

Test reviewer
└── Baseline-versus-learner semantics and false-positive risk

Security reviewer
└── Session, CSRF, authorization, template, and CI boundaries

Release verifier
└── Clean-clone commands, same-commit reports, and evidence hashes
```

```bash
git add scripts/verify-wp10-skeleton.ts scripts/verify-wp10-skeleton.test.ts scripts/verify-release-0.mjs scripts/ci/collect-release-evidence.mjs docs/architecture/release-0-evidence.md package.json vitest.config.ts pnpm-lock.yaml
git commit -m "feat: complete Release 0 skeleton gate"
```

## WP-10 exit gate

WP-10 is complete only when the same source commit proves:

- Accepted authentication and boundary ADRs
- Seven reachable gates, nine nonempty modules, and nineteen assessed competencies
- Workshop Enrollment project contract with rubric, remediation, debugging task, change request, and evidence requirements
- Fullstack template materializes outside the source monorepo
- Frozen install and baseline verification pass
- Learner verification fails only on the declared incomplete workflow
- Production documentation does not claim Release 1 or Junior Fullstack completion
- Release 1 backlog is dependency-ordered, bounded, and traceable to every competency and critical criterion
- Windows and Linux Release 0 public contracts remain green after WP-10 changes
- Final evidence gate verifies all five spikes and WP-10 records for one commit

## Checkpoint

Stop after the Release 0 evidence package is independently verified. Do not begin bulk Release 1 lesson authoring until the technical-preview skeleton has been reviewed as a coherent learner path and the first backlog batch is marked `ready` with no unresolved open questions.
