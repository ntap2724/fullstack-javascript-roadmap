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
