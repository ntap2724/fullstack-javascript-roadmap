# Authoring remediation catalogs

Assessment remediation catalogs give learners a focused recovery path for each failed
required or critical rubric criterion. Keep the catalog next to its assessment source and validate
it before publishing a rubric change.

## Catalog contract

Every catalog uses schemaVersion: 1 and has at least one entry. Each entry contains:

- criterion: the canonical dotted rubric criterion ID, such as closure.private-state.
- competency: the canonical competency ID, such as js.function.closure.
- lessons: canonical lesson-... artifact IDs to revisit.
- exercises: canonical ex-... artifact IDs for focused practice.
- retake: one or more nonempty requirements that explain the smallest meaningful recovery.

Use canonical IDs from the curriculum and rubric schemas. Do not copy titles, file paths, or
ad-hoc identifier patterns into a catalog. The [exercise authoring guide](./exercises.md) explains
the related exercise metadata boundary.

An entry for the closure-counter assessment has schemaVersion 1, criterion
closure.private-state, competency js.function.closure, lesson
lesson-js-closure-private-state, exercise ex-js-closure-counter, and focused retake requirements
such as restoring independent state and adding the negative independence test.

## Coverage and deterministic recovery

Every required or critical rubric criterion needs exactly one remediation entry. Optional,
noncritical criteria do not require one. validateRemediationCoverage reports missing entries as
ASSESSMENT_REMEDIATION_001 diagnostics with severity error and this document as the documentation
target.

Diagnostics are ordered by criterion ID so authors receive a stable, reviewable list of gaps.
When a rubric evaluation needs remediation, the assessment result preserves the evaluator's
blocking-criterion order and maps each criterion to its exact catalog entry. A missing blocking
entry is an error; it is never silently omitted or replaced with a generic recommendation.

## Author validation

Run pnpm --filter @roadmap/assessment-core check, pnpm --filter @roadmap/assessment-core test,
pnpm schema:generate, and pnpm schema:check while authoring. The generated remediation catalog
schema is committed with the package.

Every generated schema in this kernel — the rubric schema, the evidence manifest schema, and the
remediation catalog schema — is Draft 2020-12 structural prevalidation only, so schema-only
acceptance is unsupported. Each carries a root $comment naming the cross-object uniqueness
invariant it cannot express: criteria[].id for the rubric, artifacts[].id for the evidence
manifest, and entries[].criterion for the remediation catalog. Every supported ingestion path must
parse the same value through the canonical Zod schema (RubricSchema, EvidenceManifestSchema, or
RemediationCatalogSchema) after JSON-Schema prevalidation.

Exactly one entry per criterion is enforced by that runtime parser because Draft 2020-12 cannot
compare one property across distinct array objects.

Keep remediation focused: ask the learner to revisit only the lessons, exercises, and retake
requirements needed to recover the failed criterion, unless the rubric explicitly establishes
that the whole artifact is invalid.
