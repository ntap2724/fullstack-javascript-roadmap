import type { CurriculumDocument } from '@roadmap/curriculum-schema';
import type { CurriculumGraph, DeclaredReference } from '../../src/types.js';

type PublicationStatus = CurriculumDocument['data']['status'];

function trackDocument(id: string, status: PublicationStatus): CurriculumDocument {
  return {
    filePath: `${id}.md`,
    body: '',
    data: {
      schemaVersion: 1,
      kind: 'track',
      id,
      slug: `tracks/${id}`,
      title: id,
      description: `Fixture document for ${id}`,
      status,
      prerequisites: [],
      introducedIn: '0.1.0',
      lastReviewedIn: '0.1.0',
      requiredCompetencies: [],
      modules: [],
    },
  };
}

function isolatedDocuments(trackStatus: PublicationStatus): readonly CurriculumDocument[] {
  return [
    {
      filePath: 'track-root.md',
      body: '',
      data: {
        schemaVersion: 1,
        kind: 'track',
        id: 'track-root',
        slug: 'tracks/root',
        title: 'Root track',
        description: 'Status-matrix track root',
        status: trackStatus,
        prerequisites: [],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
        requiredCompetencies: ['test.contained'],
        modules: ['module-contained'],
      },
    },
    {
      filePath: 'module-contained.md',
      body: '',
      data: {
        schemaVersion: 1,
        kind: 'module',
        id: 'module-contained',
        slug: 'modules/contained',
        title: 'Contained module',
        description: 'Module reachable from the status-matrix track',
        status: 'published',
        prerequisites: [],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
        competencies: ['test.contained'],
        lessons: ['lesson-evidence'],
        milestone: 'milestone-contained',
      },
    },
    {
      filePath: 'lesson-evidence.md',
      body: '',
      data: {
        schemaVersion: 1,
        kind: 'lesson',
        id: 'lesson-evidence',
        slug: 'lessons/evidence',
        title: 'Evidence lesson',
        description: 'Valid remediation target for status-matrix competencies',
        status: 'published',
        prerequisites: [],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
        module: 'module-contained',
        competencies: ['test.contained'],
        exercises: [],
        assessments: ['assessment-evidence'],
        sourceLanguage: 'vi',
        professionalArtifactLanguage: 'en',
      },
    },
    {
      filePath: 'assessment-evidence.md',
      body: '',
      data: {
        schemaVersion: 1,
        kind: 'assessment',
        id: 'assessment-evidence',
        slug: 'assessments/evidence',
        title: 'Evidence assessment',
        description: 'Valid assessment target for status-matrix competencies',
        status: 'published',
        prerequisites: [],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
        assessmentType: 'knowledge-check',
        competencies: ['test.contained', 'test.orphan'],
      },
    },
    ...(['test.contained', 'test.orphan'] as const).map((id): CurriculumDocument => ({
      filePath: `${id}.md`,
      body: '',
      data: {
        schemaVersion: 1,
        kind: 'competency',
        id,
        slug: `competencies/${id.replace('.', '/')}`,
        title: id,
        description: `Status-matrix competency ${id}`,
        status: 'published',
        prerequisites: [],
        requiredLevel: 'explain',
        assessments: ['assessment-evidence'],
        remediation: ['lesson-evidence'],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
      },
    })),
    ...(['milestone-contained', 'milestone-orphan'] as const).map((id): CurriculumDocument => ({
      filePath: `${id}.md`,
      body: '',
      data: {
        schemaVersion: 1,
        kind: 'milestone',
        id,
        slug: `milestones/${id}`,
        title: id,
        description: `Status-matrix milestone ${id}`,
        status: 'published',
        prerequisites: [],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
        competencies: ['test.contained'],
        project: 'project-status-matrix',
        rubric: 'rubric-status-matrix',
        evidence: ['Status-matrix evidence'],
      },
    })),
  ];
}

function competencyEvidenceReferences(): readonly DeclaredReference[] {
  return (['test.contained', 'test.orphan'] as const).flatMap((declaringId) => [
    {
      declaringId,
      targetId: 'assessment-evidence',
      relation: 'competency.assessments',
      sourceFile: `${declaringId}.md`,
      pointer: 'assessments.0',
    },
    {
      declaringId,
      targetId: 'lesson-evidence',
      relation: 'competency.remediation',
      sourceFile: `${declaringId}.md`,
      pointer: 'remediation.0',
    },
  ]);
}

/**
 * Builds a deterministic graph with one reachable and one orphan competency
 * and milestone. Evidence targets are valid, isolating active-root behavior.
 */
export function buildIsolatedGraph({
  trackStatus,
  releaseReferencesTrackRoot = false,
}: {
  trackStatus: PublicationStatus;
  releaseReferencesTrackRoot?: boolean;
}): CurriculumGraph {
  const documents = isolatedDocuments(trackStatus);
  const publishedReferenceRoot =
    releaseReferencesTrackRoot ? trackDocument('track-published-reference-root', 'published') : undefined;
  const release =
    !releaseReferencesTrackRoot
      ? undefined
      : ({
          filePath: 'release-reference.md',
          body: '',
          data: {
            schemaVersion: 1,
            kind: 'release',
            id: 'release-reference',
            slug: 'releases/reference',
            title: 'Reference release',
            description: 'Release pointing at a non-published track for root testing',
            status: 'review',
            prerequisites: [],
            introducedIn: '0.1.0',
            lastReviewedIn: '0.1.0',
            version: '0.1.0',
            maturity: 'experimental',
            track: 'track-root',
            entryGate: 'gate-reference',
            exitGate: 'gate-reference',
            claims: ['Reference root regression fixture'],
            nonClaims: ['Complete curriculum'],
          },
        } satisfies CurriculumDocument);
  return {
    nodes: new Map(
      [
        ...documents,
        ...(publishedReferenceRoot === undefined ? [] : [publishedReferenceRoot]),
        ...(release === undefined ? [] : [release]),
      ].map((document) => [document.data.id, document]),
    ),
    declaredReferences: competencyEvidenceReferences(),
    edges: [
      { from: 'track-root', to: 'module-contained', type: 'contains', sourceFile: 'track-root.md' },
      {
        from: 'module-contained',
        to: 'test.contained',
        type: 'contains',
        sourceFile: 'module-contained.md',
      },
      {
        from: 'module-contained',
        to: 'lesson-evidence',
        type: 'contains',
        sourceFile: 'module-contained.md',
      },
      {
        from: 'module-contained',
        to: 'milestone-contained',
        type: 'contains',
        sourceFile: 'module-contained.md',
      },
      {
        from: 'test.contained',
        to: 'assessment-evidence',
        type: 'assesses',
        sourceFile: 'test.contained.md',
      },
      {
        from: 'test.contained',
        to: 'lesson-evidence',
        type: 'remediates',
        sourceFile: 'test.contained.md',
      },
      {
        from: 'test.orphan',
        to: 'assessment-evidence',
        type: 'assesses',
        sourceFile: 'test.orphan.md',
      },
      {
        from: 'test.orphan',
        to: 'lesson-evidence',
        type: 'remediates',
        sourceFile: 'test.orphan.md',
      },
    ],
  };
}

/**
 * Isolates declaration direction from normalized containment direction:
 * only the draft module declares the published lesson.
 */
export function buildDraftParentPublishedChildGraph(): CurriculumGraph {
  const parent: CurriculumDocument = {
    filePath: 'module-draft-parent.md',
    body: '',
    data: {
      schemaVersion: 1,
      kind: 'module',
      id: 'module-draft-parent',
      slug: 'modules/draft-parent',
      title: 'Draft parent',
      description: 'Draft module containing a published lesson',
      status: 'draft',
      prerequisites: [],
      introducedIn: '0.1.0',
      lastReviewedIn: '0.1.0',
      competencies: ['test.publication'],
      lessons: ['lesson-published-child'],
    },
  };
  const child: CurriculumDocument = {
    filePath: 'lesson-published-child.md',
    body: '',
    data: {
      schemaVersion: 1,
      kind: 'lesson',
      id: 'lesson-published-child',
      slug: 'lessons/published-child',
      title: 'Published child',
      description: 'Published lesson declared only by its draft parent',
      status: 'published',
      prerequisites: [],
      introducedIn: '0.1.0',
      lastReviewedIn: '0.1.0',
      module: 'module-draft-parent',
      competencies: ['test.publication'],
      exercises: [],
      assessments: [],
      sourceLanguage: 'vi',
      professionalArtifactLanguage: 'en',
    },
  };

  return {
    nodes: new Map([
      [parent.data.id, parent],
      [child.data.id, child],
    ]),
    declaredReferences: [
      {
        declaringId: parent.data.id,
        targetId: child.data.id,
        relation: 'module.lessons',
        sourceFile: parent.filePath,
        pointer: 'lessons.0',
      },
    ],
    edges: [
      {
        from: parent.data.id,
        to: child.data.id,
        type: 'contains',
        sourceFile: parent.filePath,
      },
    ],
  };
}

/**
 * Produces one graph with both a prerequisite cycle and a publication error,
 * proving the composed validator retains both direct diagnostic collectors.
 */
export function buildCompositeValidationGraph(): CurriculumGraph {
  const published = trackDocument('track-published', 'published');
  const draft = trackDocument('track-draft', 'draft');
  return {
    nodes: new Map([
      [published.data.id, published],
      [draft.data.id, draft],
    ]),
    declaredReferences: [
      {
        declaringId: published.data.id,
        targetId: draft.data.id,
        relation: 'prerequisites',
        sourceFile: published.filePath,
        pointer: 'prerequisites.0',
      },
    ],
    edges: [
      {
        from: published.data.id,
        to: published.data.id,
        type: 'prerequisite',
        sourceFile: published.filePath,
      },
    ],
  };
}
