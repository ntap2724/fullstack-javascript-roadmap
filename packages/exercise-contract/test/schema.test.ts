import { describe, expect, it } from 'vitest';
import { ExerciseDefinitionSchema } from '../src/index.js';

function requireValue<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Expected a value');
  return value;
}

function validExercise(): {
  schemaVersion: 1;
  id: string;
  version: string;
  title: string;
  type: string;
  language: string;
  competencies: string[];
  requiredLevel: Record<string, string>;
  prerequisites: string[];
  commands: {
    baseline: Array<Record<string, unknown>>;
    learner: Array<Record<string, unknown>>;
  };
  constraints: {
    editablePaths: string[];
    forbiddenDependencies: string[];
    forbiddenApis: string[];
  };
  evidence: string[];
  hints: Array<{ level: number; path: string }>;
} {
  return {
    schemaVersion: 1,
    id: 'ex-js-closure-counter',
    version: '1.0.0',
    title: 'Xây bộ đếm có trạng thái riêng',
    type: 'focused-exercise',
    language: 'javascript',
    competencies: ['js.scope.lexical', 'js.function.closure'],
    requiredLevel: {
      'js.scope.lexical': 'implement',
      'js.function.closure': 'implement',
    },
    prerequisites: ['js.function.values'],
    commands: {
      baseline: [
        {
          id: 'infrastructure',
          required: true,
          command: 'pnpm',
          args: ['test:infrastructure'],
          cwd: '.',
          timeoutMs: 60_000,
        },
      ],
      learner: [
        {
          id: 'contract',
          required: true,
          command: 'pnpm',
          args: ['verify'],
          cwd: '.',
          timeoutMs: 60_000,
        },
      ],
    },
    constraints: {
      editablePaths: ['src/**'],
      forbiddenDependencies: [],
      forbiddenApis: [],
    },
    evidence: ['test-report', 'source-diff', 'explanation'],
    hints: [
      { level: 1, path: 'hints/01-concept.md' },
      { level: 2, path: 'hints/02-diagnostic.md' },
      { level: 3, path: 'hints/03-structure.md' },
    ],
  };
}

describe('ExerciseDefinitionSchema', () => {
  it('accepts an argv-based focused exercise contract', () => {
    const exercise = validExercise();
    exercise.commands = {
      baseline: [requireValue(exercise.commands.baseline[0])],
      learner: [
        {
          id: 'contract',
          required: true,
          command: 'pnpm',
          args: ['verify'],
          cwd: '.',
          timeoutMs: 60_000,
        },
      ],
    };
    expect(ExerciseDefinitionSchema.parse(exercise)).toEqual(exercise);
  });

  it('rejects unknown keys at the root and command boundaries', () => {
    const invalid = validExercise() as Record<string, unknown>;
    invalid.undocumented = true;
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();

    const commandInvalid = validExercise();
    commandInvalid.commands.learner = [
      { ...requireValue(commandInvalid.commands.baseline[0]), shell: false },
    ];
    expect(() => ExerciseDefinitionSchema.parse(commandInvalid)).toThrow();
  });

  it('rejects a shell command string in place of argv metadata', () => {
    const invalid = validExercise();
    invalid.commands.learner = ['pnpm test && rm -rf .' as unknown as Record<string, unknown>];
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
  });

  it('accepts shell metacharacters as literal argv data', () => {
    const exercise = validExercise();
    exercise.commands.learner = [
      {
        id: 'literal',
        required: true,
        command: 'node',
        args: ['--eval', 'console.log("&& rm -rf .")'],
        cwd: '.',
        timeoutMs: 1,
      },
    ];
    expect(requireValue(ExerciseDefinitionSchema.parse(exercise).commands.learner[0]).args).toEqual(
      ['--eval', 'console.log("&& rm -rf .")'],
    );
  });

  it('rejects command NULs, blank commands, argv NULs, and invalid timeout bounds', () => {
    const cases = [
      (exercise: ReturnType<typeof validExercise>) => {
        requireValue(exercise.commands.learner[0]).command = '   ';
      },
      (exercise: ReturnType<typeof validExercise>) => {
        requireValue(exercise.commands.learner[0]).command = 'node\0invalid';
      },
      (exercise: ReturnType<typeof validExercise>) => {
        requireValue(exercise.commands.learner[0]).args = ['valid\0invalid'];
      },
      (exercise: ReturnType<typeof validExercise>) => {
        requireValue(exercise.commands.learner[0]).timeoutMs = 0;
      },
      (exercise: ReturnType<typeof validExercise>) => {
        requireValue(exercise.commands.learner[0]).timeoutMs = 900_001;
      },
      (exercise: ReturnType<typeof validExercise>) => {
        requireValue(exercise.commands.learner[0]).timeoutMs = Number.POSITIVE_INFINITY;
      },
    ];

    for (const mutate of cases) {
      const invalid = validExercise();
      mutate(invalid);
      expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
    }
  });

  it('permits only the semantic workspace root for command cwd', () => {
    expect(
      requireValue(ExerciseDefinitionSchema.parse(validExercise()).commands.learner[0]).cwd,
    ).toBe('.');

    for (const cwd of ['./x', 'x/.', '..', 'x/../y']) {
      const invalid = validExercise();
      requireValue(invalid.commands.learner[0]).cwd = cwd;
      expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
    }
  });

  it('enforces the complete command cwd alias boundary and accepts the upper timeout', () => {
    const boundary = validExercise();
    requireValue(boundary.commands.learner[0]).timeoutMs = 900_000;
    expect(ExerciseDefinitionSchema.parse(boundary)).toEqual(boundary);

    for (const cwd of [
      '/absolute',
      String.raw`\absolute`,
      String.raw`C:\secret`,
      String.raw`C:secret`,
      String.raw`\\server\share\secret`,
      String.raw`\\?\C:\secret`,
      String.raw`\\.\C:\secret`,
      '\u0001secret',
      'src/foo:bar.js',
      'src/CON.txt',
      'src/file.',
      'src/file. ',
    ]) {
      const invalid = validExercise();
      requireValue(invalid.commands.learner[0]).cwd = cwd;
      expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
    }
  });

  it.each([
    '**',
    '!src/**',
    '*/**',
    '{src,test}/**',
    'src/[counter].js',
    'src/@(counter|answer).js',
  ])('rejects grammar-invalid editable pattern at the schema boundary %s', (pattern) => {
    const invalid = validExercise();
    invalid.constraints.editablePaths = [pattern];
    expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
  });

  it('rejects dot paths for hints and editable patterns', () => {
    const invalidHint = validExercise();
    requireValue(invalidHint.hints[0]).path = '.';
    expect(() => ExerciseDefinitionSchema.parse(invalidHint)).toThrow();

    const invalidEditable = validExercise();
    invalidEditable.constraints.editablePaths = ['.'];
    expect(() => ExerciseDefinitionSchema.parse(invalidEditable)).toThrow();
  });

  it('requires unique, strictly increasing progressive hint levels', () => {
    for (const hints of [
      [
        { level: 1, path: 'hints/a.md' },
        { level: 1, path: 'hints/b.md' },
      ],
      [
        { level: 2, path: 'hints/a.md' },
        { level: 1, path: 'hints/b.md' },
      ],
    ]) {
      const invalid = validExercise();
      invalid.hints = hints;
      expect(() => ExerciseDefinitionSchema.parse(invalid)).toThrow();
    }
  });

  it('requires a complete required-level mapping for declared competencies', () => {
    const missing = validExercise();
    delete missing.requiredLevel['js.function.closure'];
    expect(() => ExerciseDefinitionSchema.parse(missing)).toThrow();

    const extra = validExercise();
    extra.requiredLevel['js.function.missing'] = 'implement';
    expect(() => ExerciseDefinitionSchema.parse(extra)).toThrow();
  });

  it('rejects unenforced forbidden dependency and API policy arrays', () => {
    const invalidApiPolicy = validExercise();
    invalidApiPolicy.constraints.forbiddenApis = ['globalThis'];
    expect(() => ExerciseDefinitionSchema.parse(invalidApiPolicy)).toThrow();

    const invalidDependencyPolicy = validExercise();
    invalidDependencyPolicy.constraints.forbiddenDependencies = ['some-package'];
    expect(() => ExerciseDefinitionSchema.parse(invalidDependencyPolicy)).toThrow();
  });
});
