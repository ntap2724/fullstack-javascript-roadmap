import { describe, expect, it } from 'vitest';
import {
  ArtifactIdSchema,
  CompetencyIdSchema,
  CurriculumEntitySchema,
  LessonSchema,
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
