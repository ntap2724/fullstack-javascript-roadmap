import type { CurriculumDocument } from '@roadmap/curriculum-schema';
import type { Diagnostic, SourceLocation } from '@roadmap/validation-core';
import type { CurriculumGraph, DeclaredReferenceRelation, EdgeType } from './types.js';

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function documentsOfKind(
  graph: CurriculumGraph,
  kind: CurriculumDocument['data']['kind'],
): readonly CurriculumDocument[] {
  return [...graph.nodes.values()]
    .filter((document) => document.data.kind === kind)
    .sort((left, right) => compareCodepoints(left.data.id, right.data.id));
}

function publishedTrackReachability(graph: CurriculumGraph): ReadonlySet<string> | undefined {
  const roots = documentsOfKind(graph, 'track')
    .filter((document) => document.data.status === 'published')
    .map((document) => document.data.id);
  if (roots.length === 0) return undefined;

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== 'contains') continue;
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }
  for (const targets of adjacency.values()) targets.sort(compareCodepoints);

  const reachable = new Set<string>();
  const queue = [...roots];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    for (const target of adjacency.get(id) ?? []) {
      if (!reachable.has(target)) queue.push(target);
    }
  }

  return reachable;
}

function hasEvidenceTarget(
  graph: CurriculumGraph,
  competencyId: string,
  edgeType: EdgeType,
  targetKind: CurriculumDocument['data']['kind'],
): boolean {
  return graph.edges.some((edge) => {
    if (edge.type !== edgeType || edge.from !== competencyId) return false;
    return graph.nodes.get(edge.to)?.data.kind === targetKind;
  });
}

function declarationLocation(
  graph: CurriculumGraph,
  document: CurriculumDocument,
  relation: DeclaredReferenceRelation,
): SourceLocation {
  const declaration = graph.declaredReferences.find(
    (reference) => reference.declaringId === document.data.id && reference.relation === relation,
  );
  return declaration === undefined
    ? { file: document.filePath }
    : { file: declaration.sourceFile, pointer: declaration.pointer };
}

function unreachableCompetencyDiagnostic(document: CurriculumDocument): Diagnostic {
  return {
    code: 'CURRICULUM_COMPLETENESS_001',
    severity: 'error',
    location: { file: document.filePath },
    observed: document.data.id,
    expected:
      'A contains path from a published track to a module containing the required competency',
    reason: `Required competency "${document.data.id}" is not reachable from any published track`,
    remediation: 'Contain the competency in a module reachable from a published track',
    documentation: 'docs/architecture/curriculum-graph.md#completeness',
  };
}

function missingAssessmentDiagnostic(
  graph: CurriculumGraph,
  document: CurriculumDocument,
): Diagnostic {
  return {
    code: 'CURRICULUM_COMPLETENESS_002',
    severity: 'error',
    location: declarationLocation(graph, document, 'competency.assessments'),
    observed: document.data.id,
    expected: 'A resolved assesses edge to a registered assessment',
    reason: `Required competency "${document.data.id}" has no registered assessment target`,
    remediation: 'Reference at least one registered assessment from the competency',
    documentation: 'docs/architecture/curriculum-graph.md#completeness',
  };
}

function missingRemediationDiagnostic(
  graph: CurriculumGraph,
  document: CurriculumDocument,
): Diagnostic {
  return {
    code: 'CURRICULUM_COMPLETENESS_003',
    severity: 'error',
    location: declarationLocation(graph, document, 'competency.remediation'),
    observed: document.data.id,
    expected: 'A resolved remediates edge to a registered lesson',
    reason: `Required competency "${document.data.id}" has no registered remediation lesson`,
    remediation: 'Reference at least one registered lesson from the competency remediation field',
    documentation: 'docs/architecture/curriculum-graph.md#completeness',
  };
}

function unreachableMilestoneDiagnostic(document: CurriculumDocument): Diagnostic {
  return {
    code: 'CURRICULUM_COMPLETENESS_004',
    severity: 'error',
    location: { file: document.filePath },
    observed: document.data.id,
    expected: 'A contains path from a published track to the milestone',
    reason: `Milestone "${document.data.id}" is not reachable from any published track`,
    remediation: 'Attach the milestone to a module reachable from a published track',
    documentation: 'docs/architecture/curriculum-graph.md#completeness',
  };
}

/**
 * Enforces published-track-rooted reachability and kind-correct competency
 * evidence. Root-relative diagnostics are omitted when no published track
 * exists; evidence diagnostics still apply to every registered competency.
 */
export function completenessDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const reachable = publishedTrackReachability(graph);

  for (const competency of documentsOfKind(graph, 'competency')) {
    if (reachable !== undefined && !reachable.has(competency.data.id)) {
      diagnostics.push(unreachableCompetencyDiagnostic(competency));
    }
    if (!hasEvidenceTarget(graph, competency.data.id, 'assesses', 'assessment')) {
      diagnostics.push(missingAssessmentDiagnostic(graph, competency));
    }
    if (!hasEvidenceTarget(graph, competency.data.id, 'remediates', 'lesson')) {
      diagnostics.push(missingRemediationDiagnostic(graph, competency));
    }
  }

  if (reachable !== undefined) {
    for (const milestone of documentsOfKind(graph, 'milestone')) {
      if (!reachable.has(milestone.data.id)) {
        diagnostics.push(unreachableMilestoneDiagnostic(milestone));
      }
    }
  }

  return diagnostics;
}
