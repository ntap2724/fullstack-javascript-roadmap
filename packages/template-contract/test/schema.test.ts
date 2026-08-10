import { describe, expect, it } from 'vitest';
import { TemplateDefinitionSchema, TemplateProvenanceSchema } from '../src/index.js';

const definition = {
  schemaVersion: 1,
  id: 'template-javascript-engineering',
  repositoryName: 'javascript-engineering-starter',
  version: '0.1.0',
  curriculum: { release: '0.1.0', entryPoint: 'project-javascript-engineering-baseline' },
  runtime: { nodeFamily: 24, packageManager: 'pnpm' },
  publication: {
    include: ['files/**'],
    exclude: ['files/**/solution/**', 'files/**/private-fixtures/**', 'files/**/*.internal.*'],
    textTransforms: [
      { token: '{{TEMPLATE_VERSION}}', valueFrom: 'template.version' },
      { token: '{{CURRICULUM_VERSION}}', valueFrom: 'curriculum.release' },
    ],
  },
  verification: {
    install: {
      command: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      cwd: '.',
      timeoutMs: 180000,
    },
    baseline: { command: 'pnpm', args: ['verify:baseline'], cwd: '.', timeoutMs: 180000 },
  },
};

describe('TemplateDefinitionSchema', () => {
  it('accepts an allowlisted argv-based template contract', () => {
    expect(TemplateDefinitionSchema.parse(definition)).toEqual(definition);
  });

  it('rejects empty include lists', () => {
    expect(() =>
      TemplateDefinitionSchema.parse({
        ...definition,
        publication: { ...definition.publication, include: [] },
      }),
    ).toThrow();
  });
});

describe('TemplateProvenanceSchema', () => {
  it('requires a full source commit and exact toolchain versions', () => {
    expect(() =>
      TemplateProvenanceSchema.parse({
        schemaVersion: 1,
        templateId: definition.id,
        templateVersion: definition.version,
        curriculumVersion: definition.curriculum.release,
        sourceRepository: 'fullstack-javascript-roadmap',
        sourceCommit: 'main',
        generatedAt: '2026-07-26T12:00:00.000Z',
        toolchain: { node: '24.0.0', pnpm: '11.0.0' },
        contractVersions: { exercise: 1, rubric: 1, evidence: 1, template: 1 },
      }),
    ).toThrow();
  });
});

describe('TemplateDefinitionSchema negative cases', () => {
  it.each([
    {
      name: 'parent traversal in a publication glob',
      value: {
        ...definition,
        publication: { ...definition.publication, include: ['../files/**'] },
      },
      path: ['publication', 'include', 0],
    },
    {
      name: 'absolute verification working directory',
      value: {
        ...definition,
        verification: {
          ...definition.verification,
          baseline: {
            ...definition.verification.baseline,
            cwd: process.platform === 'win32' ? 'C:\\temp' : '/tmp',
          },
        },
      },
      path: ['verification', 'baseline', 'cwd'],
    },
    {
      name: 'wrong Node family type',
      value: { ...definition, runtime: { ...definition.runtime, nodeFamily: '24' } },
      path: ['runtime', 'nodeFamily'],
    },
  ])('rejects $name at the expected path', ({ value, path }) => {
    const result = TemplateDefinitionSchema.safeParse(value);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.path).toEqual(path);
  });

  it('rejects duplicate transform tokens at publication.textTransforms', () => {
    const result = TemplateDefinitionSchema.safeParse({
      ...definition,
      publication: {
        ...definition.publication,
        textTransforms: [
          ...definition.publication.textTransforms,
          definition.publication.textTransforms[0],
        ],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.at(-1)?.path).toEqual(['publication', 'textTransforms']);
  });

  it('rejects shell syntax as one command token instead of argv', () => {
    const result = TemplateDefinitionSchema.safeParse({
      ...definition,
      verification: {
        ...definition.verification,
        baseline: {
          ...definition.verification.baseline,
          command: 'pnpm verify:baseline && echo passed',
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
