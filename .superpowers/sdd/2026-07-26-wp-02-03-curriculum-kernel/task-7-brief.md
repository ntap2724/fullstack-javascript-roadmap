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
