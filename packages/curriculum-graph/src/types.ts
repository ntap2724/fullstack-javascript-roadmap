import type { CurriculumDocument } from '@roadmap/curriculum-schema';

export type EdgeType =
  'prerequisite' | 'contains' | 'assesses' | 'remediates' | 'milestone-project';

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
