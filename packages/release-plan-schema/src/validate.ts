import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import type { ReleasePlan } from './schema.js';

export interface ReleasePlanValidationContext {
  competencyIds: readonly string[];
  moduleIds: readonly string[];
  criterionIds: readonly string[];
  criticalCriteria: readonly string[];
  moduleCompetencies?: ReadonlyMap<string, readonly string[]>;
  criterionCompetencies?: ReadonlyMap<string, string>;
  /** Ordered modules that require exactly one active R1-CONTENT-* planning record each. */
  contentSequenceModules?: readonly string[];
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

function topologicalOrder(items: readonly ReleasePlan['items'][number][]): {
  order: string[];
  unresolved: string[];
} {
  const byId = new Map(items.map((item) => [item.id, item]));
  const indegree = new Map(items.map((item) => [item.id, 0]));
  const outgoing = new Map(items.map((item) => [item.id, [] as string[]]));

  for (const item of items) {
    for (const dependency of item.dependsOn) {
      if (!byId.has(dependency)) continue;
      indegree.set(item.id, (indegree.get(item.id) ?? 0) + 1);
      outgoing.get(dependency)?.push(item.id);
    }
  }

  const ready = [...indegree]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined) break;
    order.push(id);
    for (const target of outgoing.get(id)?.sort() ?? []) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }

  return {
    order,
    unresolved: [...indegree]
      .filter(([, count]) => count > 0)
      .map(([id]) => id)
      .sort(),
  };
}

export function validateReleasePlan(
  plan: ReleasePlan,
  context: ReleasePlanValidationContext,
): ValidationOutcome<ValidatedReleasePlan> {
  const diagnostics: Diagnostic[] = [];
  const activeItems = plan.items.filter((item) => item.status !== 'withdrawn');
  const ids = plan.items.map((item) => item.id);
  const contentSequenceModules = context.contentSequenceModules;
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort();
  if (duplicateIds.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_ID_001',
        duplicateIds,
        'Unique work-item IDs',
        'Duplicate IDs make evidence and dependency references ambiguous',
      ),
    );
  }

  const known = new Set(activeItems.map((item) => item.id));
  const withdrawnIds = new Set(
    plan.items.filter((item) => item.status === 'withdrawn').map((item) => item.id),
  );
  const missingDependencies = activeItems
    .flatMap((item) =>
      item.dependsOn
        .filter((id) => !known.has(id))
        .map((id) => `${item.id}->${id}${withdrawnIds.has(id) ? ' (withdrawn)' : ''}`),
    )
    .sort();
  if (missingDependencies.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_DEPENDENCY_001',
        missingDependencies,
        'Every dependency resolves',
        'One or more work items depend on missing IDs',
      ),
    );
  }

  const sorted = topologicalOrder(activeItems);
  if (sorted.unresolved.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_CYCLE_001',
        sorted.unresolved,
        'Acyclic dependency graph',
        'The backlog contains a dependency cycle',
      ),
    );
  }

  const unbounded = activeItems
    .filter((item) =>
      /^(?:finish|complete|build|improve)\s+(?:all\s+)?release\s+1\b|production-ready|entire curriculum/i.test(
        item.objective,
      ),
    )
    .map((item) => item.id);
  if (unbounded.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_SCOPE_001',
        unbounded,
        'One bounded, reviewable outcome per item',
        'One or more objectives are too broad to verify independently',
      ),
    );
  }

  const coveredCompetencies = new Set(activeItems.flatMap((item) => item.coverage.competencies));
  const unknownCompetencies = [...coveredCompetencies]
    .filter((id) => !context.competencyIds.includes(id))
    .sort();
  const missingCompetencies = context.competencyIds
    .filter((id) => !coveredCompetencies.has(id))
    .sort();
  if (unknownCompetencies.length > 0 || missingCompetencies.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_TRACEABILITY_001',
        { unknownCompetencies, missingCompetencies },
        'Every Release 1 competency is covered exactly by known IDs',
        'Competency-to-work traceability is incomplete or references unknown IDs',
      ),
    );
  }

  const misalignedCompetencies = activeItems.flatMap((item) => {
    if (context.moduleCompetencies === undefined) return [];
    const supported = new Set(
      item.coverage.modules.flatMap((target) => context.moduleCompetencies?.get(target.id) ?? []),
    );
    return item.coverage.competencies
      .filter((competency) => !supported.has(competency))
      .map((competency) => `${item.id}->${competency}`);
  });
  if (misalignedCompetencies.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_COMPETENCY_MODULE_001',
        misalignedCompetencies.sort(),
        "Every item competency belongs to one of that item's covered modules",
        'A work item claims competency coverage outside its declared module scope',
      ),
    );
  }

  const moduleRoles = new Map<string, Set<string>>();
  for (const target of activeItems.flatMap((item) => item.coverage.modules)) {
    const roles = moduleRoles.get(target.id) ?? new Set<string>();
    target.roles.forEach((role) => roles.add(role));
    moduleRoles.set(target.id, roles);
  }
  const invalidModules = context.moduleIds.filter((id) => {
    const roles = moduleRoles.get(id);
    return !roles?.has('content') || !roles.has('assessment');
  });
  const unknownModules = [...moduleRoles.keys()]
    .filter((id) => !context.moduleIds.includes(id))
    .sort();
  if (invalidModules.length > 0 || unknownModules.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_MODULE_001',
        { invalidModules, unknownModules },
        'Every known module has content and assessment work',
        'Module coverage is incomplete or references an unknown module',
      ),
    );
  }

  const misalignedCriteria = activeItems.flatMap((item) => {
    if (context.criterionCompetencies === undefined) return [];
    const supported = new Set([
      ...item.coverage.competencies,
      ...item.coverage.modules.flatMap(
        (target) => context.moduleCompetencies?.get(target.id) ?? [],
      ),
    ]);
    return item.coverage.criteria
      .filter((target) => {
        const competency = context.criterionCompetencies?.get(target.id);
        return competency !== undefined && !supported.has(competency);
      })
      .map((target) => `${item.id}->${target.id}`);
  });
  if (misalignedCriteria.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_CRITERION_ALIGNMENT_001',
        misalignedCriteria.sort(),
        "Every covered criterion aligns with the item's competency and module scope",
        'A work item claims a rubric criterion outside its declared competency scope',
      ),
    );
  }

  const criterionRoles = new Map<string, Set<string>>();
  for (const target of activeItems.flatMap((item) => item.coverage.criteria)) {
    const roles = criterionRoles.get(target.id) ?? new Set<string>();
    target.roles.forEach((role) => roles.add(role));
    criterionRoles.set(target.id, roles);
  }
  const requiredRoles = ['implementation', 'test', 'remediation'];
  const invalidCriteria = context.criticalCriteria.filter((id) =>
    requiredRoles.some((role) => !criterionRoles.get(id)?.has(role)),
  );
  const unknownCriteria = [...criterionRoles.keys()]
    .filter((id) => !context.criterionIds.includes(id))
    .sort();
  if (invalidCriteria.length > 0 || unknownCriteria.length > 0) {
    diagnostics.push(
      issue(
        'RELEASE_PLAN_CRITERION_001',
        { invalidCriteria, unknownCriteria },
        'Every critical criterion has implementation, test, and remediation work',
        'Critical quality-gate traceability is incomplete or unknown',
      ),
    );
  }

  if (contentSequenceModules !== undefined) {
    const contentItems = activeItems.filter((item) => item.id.startsWith('R1-CONTENT-'));
    const moduleToItems = new Map<string, string[]>();
    for (const item of contentItems) {
      for (const module of item.coverage.modules) {
        if (module.roles.includes('content')) {
          moduleToItems.set(module.id, [...(moduleToItems.get(module.id) ?? []), item.id]);
        }
      }
    }
    const sequenceProblems = contentSequenceModules.flatMap((moduleId, index) => {
      const matches = moduleToItems.get(moduleId) ?? [];
      const problems: string[] = [];
      if (matches.length !== 1)
        problems.push(`${moduleId}:expected-one-found-${String(matches.length)}`);
      if (index > 0 && matches.length === 1) {
        const previous = moduleToItems.get(contentSequenceModules[index - 1] ?? '') ?? [];
        const contentItemId = matches[0];
        const previousItemId = previous[0];
        const item = activeItems.find((candidate) => candidate.id === contentItemId);
        if (
          previous.length === 1 &&
          contentItemId !== undefined &&
          previousItemId !== undefined &&
          !item?.dependsOn.includes(previousItemId)
        ) {
          problems.push(`${contentItemId} must depend on ${previousItemId}`);
        }
      }
      return problems;
    });
    const extraModules = [...moduleToItems.keys()].filter(
      (moduleId) => !contentSequenceModules.includes(moduleId),
    );
    sequenceProblems.push(
      ...extraModules.map((moduleId) => `${moduleId}:unexpected-content-sequence`),
    );
    if (sequenceProblems.length > 0) {
      diagnostics.push(
        issue(
          'RELEASE_PLAN_CONTENT_SEQUENCE_001',
          sequenceProblems.sort(),
          'Exactly one active R1-CONTENT-* item per ordered module, chained in module order',
          'Release 1 content sequencing is incomplete, duplicated, or out of order',
        ),
      );
    }
  }

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
