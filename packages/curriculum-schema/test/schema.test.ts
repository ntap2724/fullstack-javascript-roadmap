import { describe, expect, it } from 'vitest';
import {
  ArtifactIdSchema,
  CompetencyIdSchema,
  CurriculumEntitySchema,
  GateSchema,
  LessonSchema,
  ProjectSchema,
  ReleaseSchema,
  TrackSchema,
} from '../src/index.js';

describe('stable identifiers', () => {
  it.each(['js.function.closure', 'api.authz.resource-ownership'])(
    'accepts competency ID %s',
    (id) => {
      expect(CompetencyIdSchema.parse(id)).toBe(id);
    },
  );

  it.each([
    'lesson-js-closure-private-state',
    'module-js-functions',
    'ex-js-closure-counter',
    'rubric-workshop-enrollment',
  ])('accepts artifact ID %s', (id) => {
    expect(ArtifactIdSchema.parse(id)).toBe(id);
  });

  it.each(['Lesson JS', 'js', 'lesson_js'])('rejects invalid artifact ID %s', (id) => {
    expect(() => ArtifactIdSchema.parse(id)).toThrow();
  });
});

describe('competency schema', () => {
  it.each([
    'competencies/http/request-response-semantics-',
    '/competencies/http',
    'competencies//http',
  ])('rejects malformed route slug %s', (slug) => {
    expect(() =>
      CurriculumEntitySchema.parse({
        schemaVersion: 1,
        kind: 'competency',
        id: 'http.request-response-semantics',
        slug,
        title: 'HTTP request and response semantics',
        description: 'Validates canonical competency routes',
        status: 'review',
        prerequisites: [],
        requiredLevel: 'explain',
        assessments: ['assessment-express-postgresql'],
        remediation: ['lesson-http-express-orientation'],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
      }),
    ).toThrow();
  });
});
describe('lesson schema', () => {
  it('accepts a minimal published lesson', () => {
    const lesson = LessonSchema.parse({
      schemaVersion: 1,
      kind: 'lesson',
      id: 'lesson-js-closure-private-state',
      slug: 'javascript/functions/closure-private-state',
      title: 'Closure và trạng thái riêng',
      description: 'Giải thích lexical environment được giữ lại như thế nào',
      status: 'published',
      module: 'module-js-functions',
      competencies: ['js.function.closure'],
      prerequisites: ['js.function.values'],
      exercises: ['ex-js-closure-counter'],
      assessments: ['assessment-js-closure'],
      introducedIn: '0.1.0',
      lastReviewedIn: '0.1.0',
      sourceLanguage: 'vi',
      professionalArtifactLanguage: 'en',
    });
    expect(lesson.kind).toBe('lesson');
  });

  it('rejects unknown fields to prevent silent metadata drift', () => {
    const result = CurriculumEntitySchema.safeParse({
      schemaVersion: 1,
      kind: 'lesson',
      id: 'lesson-js-invalid',
      title: 'Invalid',
      status: 'draft',
      undocumentedField: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('release schema', () => {
  it('accepts the Release 1 technical-preview catalog', () => {
    expect(
      ReleaseSchema.parse({
        schemaVersion: 1,
        kind: 'release',
        id: 'release-0-1-0',
        slug: 'releases/0-1-0',
        title: 'Release 1 Technical Preview Skeleton',
        description:
          'A bounded path that proves the Release 1 architecture without claiming curriculum completion',
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
      }).kind,
    ).toBe('release');
  });
});

describe('gate schema', () => {
  it('requires track gates and a gate exit assessment', () => {
    expect(() =>
      TrackSchema.parse({
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
      }),
    ).toThrow();
    expect(() => GateSchema.parse({ kind: 'gate' })).toThrow();
  });
});

describe('project schema', () => {
  it('accepts a project page that points to an external machine-readable contract', () => {
    expect(
      ProjectSchema.parse({
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
      }).contractPath,
    ).toContain('workshop-enrollment');
  });

  it('rejects absolute contract paths', () => {
    expect(() =>
      ProjectSchema.parse({
        schemaVersion: 1,
        kind: 'project',
        id: 'project-workshop-enrollment',
        slug: 'projects/workshop-enrollment',
        title: 'Workshop Enrollment',
        description: 'Reference vertical-slice milestone',
        status: 'review',
        prerequisites: [],
        introducedIn: '0.1.0',
        lastReviewedIn: '0.1.0',
        competencies: ['db.transaction.atomic-enrollment'],
        contractPath: 'C:\\secret\\contract.yaml',
      }),
    ).toThrow();
  });
});
