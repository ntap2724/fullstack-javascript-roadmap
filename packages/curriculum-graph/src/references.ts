import path from 'node:path';
import type { CurriculumDocument } from '@roadmap/curriculum-schema';
import type { Diagnostic } from '@roadmap/validation-core';
import type { DeclaredReference, DeclaredReferenceRelation } from './types.js';

/**
 * Normalizes a file path to forward-slash separators for comparison only.
 * The stored `sourceFile`/`location.file` values remain OS-native, matching
 * the loader's existing Diagnostic.location.file convention.
 */
function toComparableSourceFile(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function compareCodepoints(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDeclaredReferences(a: DeclaredReference, b: DeclaredReference): number {
  return (
    compareCodepoints(toComparableSourceFile(a.sourceFile), toComparableSourceFile(b.sourceFile)) ||
    compareCodepoints(a.pointer, b.pointer) ||
    compareCodepoints(a.declaringId, b.declaringId) ||
    compareCodepoints(a.relation, b.relation) ||
    compareCodepoints(a.targetId, b.targetId)
  );
}

function referencesFromArray(
  ids: readonly string[],
  relation: DeclaredReferenceRelation,
  fieldName: string,
  declaringId: string,
  sourceFile: string,
): DeclaredReference[] {
  return ids.map((targetId, index) => ({
    declaringId,
    targetId,
    relation,
    sourceFile,
    pointer: `${fieldName}.${index.toString()}`,
  }));
}

function enumerateForDocument(document: CurriculumDocument): DeclaredReference[] {
  const { data, filePath } = document;
  const declaringId = data.id;
  const refs: DeclaredReference[] = referencesFromArray(
    data.prerequisites,
    'prerequisites',
    'prerequisites',
    declaringId,
    filePath,
  );

  switch (data.kind) {
    case 'track':
      refs.push(
        ...referencesFromArray(
          data.requiredCompetencies,
          'track.requiredCompetencies',
          'requiredCompetencies',
          declaringId,
          filePath,
        ),
        ...referencesFromArray(data.modules, 'track.modules', 'modules', declaringId, filePath),
      );
      break;
    case 'module':
      refs.push(
        ...referencesFromArray(
          data.competencies,
          'module.competencies',
          'competencies',
          declaringId,
          filePath,
        ),
        ...referencesFromArray(data.lessons, 'module.lessons', 'lessons', declaringId, filePath),
      );
      if (data.milestone !== undefined) {
        refs.push({
          declaringId,
          targetId: data.milestone,
          relation: 'module.milestone',
          sourceFile: filePath,
          pointer: 'milestone',
        });
      }
      break;
    case 'lesson':
      refs.push(
        {
          declaringId,
          targetId: data.module,
          relation: 'lesson.module',
          sourceFile: filePath,
          pointer: 'module',
        },
        ...referencesFromArray(
          data.competencies,
          'lesson.competencies',
          'competencies',
          declaringId,
          filePath,
        ),
        ...referencesFromArray(
          data.exercises,
          'lesson.exercises',
          'exercises',
          declaringId,
          filePath,
        ),
        ...referencesFromArray(
          data.assessments,
          'lesson.assessments',
          'assessments',
          declaringId,
          filePath,
        ),
      );
      break;
    case 'assessment':
      refs.push(
        ...referencesFromArray(
          data.competencies,
          'assessment.competencies',
          'competencies',
          declaringId,
          filePath,
        ),
      );
      if (data.artifact !== undefined) {
        refs.push({
          declaringId,
          targetId: data.artifact,
          relation: 'assessment.artifact',
          sourceFile: filePath,
          pointer: 'artifact',
        });
      }
      break;
    case 'competency':
      refs.push(
        ...referencesFromArray(
          data.assessments,
          'competency.assessments',
          'assessments',
          declaringId,
          filePath,
        ),
        ...referencesFromArray(
          data.remediation,
          'competency.remediation',
          'remediation',
          declaringId,
          filePath,
        ),
      );
      break;
    case 'milestone':
      refs.push(
        ...referencesFromArray(
          data.competencies,
          'milestone.competencies',
          'competencies',
          declaringId,
          filePath,
        ),
        {
          declaringId,
          targetId: data.project,
          relation: 'milestone.project',
          sourceFile: filePath,
          pointer: 'project',
        },
        {
          declaringId,
          targetId: data.rubric,
          relation: 'milestone.rubric',
          sourceFile: filePath,
          pointer: 'rubric',
        },
      );
      break;
  }

  return refs;
}

/**
 * Enumerates every declared reference across the corpus in deterministic
 * order: sorted by sourceFile, then pointer, then declaringId, relation,
 * and targetId. Declaration ownership is always declaring document ->
 * referenced target, even for relations that normalize to a reversed edge.
 */
export function enumerateDeclaredReferences(
  documents: readonly CurriculumDocument[],
): DeclaredReference[] {
  const refs = documents.flatMap((document) => enumerateForDocument(document));
  return refs.sort(compareDeclaredReferences);
}

/**
 * WP-02-03 reference-field matrix: which relations require the target to be
 * locally resolvable in the registry. Relations pointing at later-package
 * families (lesson.exercises, assessment.artifact, milestone.project,
 * milestone.rubric) are declaration-only and never locally validated.
 */
const RESOLVE_LOCALLY: Record<DeclaredReferenceRelation, boolean> = {
  prerequisites: true,
  'track.requiredCompetencies': true,
  'track.modules': true,
  'module.competencies': true,
  'module.lessons': true,
  'module.milestone': true,
  'lesson.module': true,
  'lesson.competencies': true,
  'lesson.exercises': false,
  'lesson.assessments': true,
  'competency.assessments': true,
  'competency.remediation': true,
  'assessment.competencies': true,
  'assessment.artifact': false,
  'milestone.competencies': true,
  'milestone.project': false,
  'milestone.rubric': false,
};

/**
 * Resolves every required local reference against the registry. Emits
 * CURRICULUM_REFERENCE_001 at the declaring document's sourceFile and exact
 * dot-separated pointer for each unresolved required target.
 */
export function resolveReferences(
  nodes: ReadonlyMap<string, CurriculumDocument>,
  declaredReferences: readonly DeclaredReference[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const reference of declaredReferences) {
    if (!RESOLVE_LOCALLY[reference.relation]) continue;
    if (nodes.has(reference.targetId)) continue;

    diagnostics.push({
      code: 'CURRICULUM_REFERENCE_001',
      severity: 'error',
      location: { file: reference.sourceFile, pointer: reference.pointer },
      observed: reference.targetId,
      expected: `A curriculum document with id "${reference.targetId}" registered in the corpus`,
      reason: `The ${reference.relation} reference to "${reference.targetId}" does not resolve to a known document`,
      remediation: 'Correct the referenced id or add the missing document to the corpus',
      documentation: 'docs/authoring/curriculum-metadata.md',
    });
  }

  return diagnostics;
}
