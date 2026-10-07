import type {
  CurriculumEdge,
  DeclaredReference,
  DeclaredReferenceRelation,
  EdgeType,
} from './types.js';

type EdgeDirection = 'forward' | 'reverse';

interface EdgeSpec {
  type: EdgeType;
  direction: EdgeDirection;
}

/**
 * Relations that normalize to a structural edge, per the WP-02-03
 * reference-field matrix. `forward` means declaring -> target; `reverse`
 * means target -> declaring (used when the declaring field names the
 * container rather than the contained entity, e.g. lesson.module).
 * Relations absent from this table are declaration-only.
 */
const EDGE_SPECS: Partial<Record<DeclaredReferenceRelation, EdgeSpec>> = {
  prerequisites: { type: 'prerequisite', direction: 'forward' },
  'track.modules': { type: 'contains', direction: 'forward' },
  'track.gates': { type: 'contains', direction: 'forward' },
  'module.competencies': { type: 'contains', direction: 'forward' },
  'module.lessons': { type: 'contains', direction: 'forward' },
  'module.milestone': { type: 'contains', direction: 'forward' },
  'lesson.module': { type: 'contains', direction: 'reverse' },
  'competency.assessments': { type: 'assesses', direction: 'forward' },
  'competency.remediation': { type: 'remediates', direction: 'forward' },
  'assessment.competencies': { type: 'assesses', direction: 'reverse' },
  'release.track': { type: 'contains', direction: 'forward' },
  'release.entryGate': { type: 'contains', direction: 'forward' },
  'release.exitGate': { type: 'contains', direction: 'forward' },
  'gate.competencies': { type: 'contains', direction: 'forward' },
  'gate.exitAssessment': { type: 'assesses', direction: 'forward' },
  'gate.remediation': { type: 'remediates', direction: 'forward' },
  'project.competencies': { type: 'contains', direction: 'forward' },
};

/**
 * Normalizes declared references into structural edges, deduplicated by
 * (type, from, to). Reciprocal declarations that normalize to the same
 * triple (e.g. module.lessons and lesson.module) collapse into one edge.
 * The edge's sourceFile comes from the first declaration encountered, in
 * the deterministic order of the input array.
 */
export function normalizeEdges(declaredReferences: readonly DeclaredReference[]): CurriculumEdge[] {
  const edgesByKey = new Map<string, CurriculumEdge>();

  for (const reference of declaredReferences) {
    const spec = EDGE_SPECS[reference.relation];
    if (spec === undefined) continue;

    const from = spec.direction === 'forward' ? reference.declaringId : reference.targetId;
    const to = spec.direction === 'forward' ? reference.targetId : reference.declaringId;
    const key = `${spec.type} ${from} ${to}`;

    if (!edgesByKey.has(key)) {
      edgesByKey.set(key, { from, to, type: spec.type, sourceFile: reference.sourceFile });
    }
  }

  return [...edgesByKey.values()];
}
