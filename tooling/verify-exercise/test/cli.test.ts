import { createHash } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import {
  loadExercise,
  type ExerciseVerificationReport,
  type ExerciseWorkspace,
} from '@roadmap/exercise-runner';
import {
  parseArguments,
  runCli,
  type RunCliOptions,
  validateExerciseOwnership,
} from '../src/main.js';

const exerciseRoot = fileURLToPath(
  new URL('../../../exercises/javascript/ex-js-closure-counter/', import.meta.url),
);
const curriculumRoot = fileURLToPath(new URL('../../../curriculum/', import.meta.url));
const repoRoot = path.resolve(exerciseRoot, '../../..');

interface JsonRecord {
  readonly [key: string]: unknown;
}

interface BaselineFileRecord {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function jsonRecord(text: string): JsonRecord {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) throw new Error('Expected one JSON object');
  return parsed;
}

function stringValue(record: JsonRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error('Expected string field ' + key);
  return value;
}

function diagnosticCodes(record: JsonRecord): string[] {
  const diagnostics = record.diagnostics;
  if (!isUnknownArray(diagnostics)) throw new Error('Expected diagnostics array');
  return diagnostics.map((value) => {
    if (!isRecord(value)) throw new Error('Expected diagnostic object');
    return stringValue(value, 'code');
  });
}

function firstDiagnostic(record: JsonRecord): JsonRecord {
  const diagnostics = record.diagnostics;
  if (!isUnknownArray(diagnostics) || diagnostics.length !== 1) {
    throw new Error('Expected one diagnostic');
  }
  const diagnostic = diagnostics[0];
  if (!isRecord(diagnostic)) throw new Error('Expected diagnostic object');
  return diagnostic;
}

function baselineRecords(record: JsonRecord): readonly BaselineFileRecord[] {
  const files = record.files;
  if (!isUnknownArray(files)) throw new Error('Expected baseline files');
  return files.map((value) => {
    if (!isRecord(value)) throw new Error('Expected baseline file record');
    const relativePath = value.path;
    const bytes = value.bytes;
    const sha256 = value.sha256;
    if (
      typeof relativePath !== 'string' ||
      typeof bytes !== 'number' ||
      typeof sha256 !== 'string'
    ) {
      throw new Error('Expected typed baseline file record');
    }
    return { path: relativePath, bytes, sha256 };
  });
}

function slashPath(value: string): string {
  return value.split(path.sep).join('/');
}

async function fileInventory(root: string): Promise<readonly string[]> {
  const files: string[] = [];
  async function visit(current: string, prefix: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        files.push(slashPath(relative));
      } else {
        throw new Error(`Unsupported inventory entry: ${relative}`);
      }
    }
  }
  await visit(root, '');
  return files.sort();
}

function reportFor(
  exerciseId: string,
  mode: 'baseline' | 'learner',
  diagnosticCode?: string,
): ExerciseVerificationReport {
  return {
    exerciseId,
    mode,
    status: diagnosticCode === undefined ? 'passed' : 'failed',
    steps: [],
    diagnostics:
      diagnosticCode === undefined
        ? []
        : [
            {
              code: diagnosticCode,
              severity: 'error',
              location: { file: 'fixture.yaml', line: 7, column: 3, pointer: '/fixture' },
              observed: 'observed-value',
              expected: 'expected-value',
              reason: 'reason-value',
              remediation: 'remediation-value',
              documentation: 'placeholder-documentation',
            },
          ],
  };
}

function lifecycleDependencies(calls: {
  value: number;
}): NonNullable<RunCliOptions['dependencies']> {
  return {
    verifyExercise: (definition, _workspace, mode) => {
      calls.value += 1;
      return Promise.resolve(reportFor(definition.id, mode));
    },
  };
}

function projectionDependencies(
  loaded: Awaited<ReturnType<typeof loadExercise>>,
  diagnosticCode: string,
): NonNullable<RunCliOptions['dependencies']> {
  if (!loaded.ok) throw new Error('Canonical exercise must load for projection test');
  const workspace: ExerciseWorkspace = {
    exerciseId: loaded.value.id,
    sourceRoot: exerciseRoot,
    root: repoRoot,
    baselineManifestPath: path.join(repoRoot, '.roadmap', 'exercise-baseline.json'),
  };
  return {
    loadExercise: () => Promise.resolve(loaded),
    openExerciseWorkspace: () => Promise.resolve({ ok: true, value: workspace, diagnostics: [] }),
    verifyExercise: (definition, _workspace, mode) =>
      Promise.resolve(reportFor(definition.id, mode, diagnosticCode)),
  };
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return false;
    throw error;
  }
}

describe('verify-exercise CLI', () => {
  it('is import-safe and exposes the bounded execution helpers', async () => {
    const imported = await import('../src/main.js');
    expect(imported.parseArguments).toBeTypeOf('function');
    expect(imported.runCli).toBeTypeOf('function');
    expect(imported.emit).toBeTypeOf('function');
    expect(imported.validateExerciseOwnership).toBeTypeOf('function');
  });

  it('accepts the documented machine invocation shape', () => {
    const parsed = parseArguments(['exercise-root', 'workspace', 'baseline', '--json'], 'D:/repo');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.machine).toBe(true);
      expect(parsed.mode).toBe('baseline');
      expect(parsed.sourceRoot).toBe(path.resolve('D:/repo', 'exercise-root'));
      expect(parsed.workspace).toBe(path.resolve('D:/repo', 'workspace'));
    }
  });

  it.each([
    ['duplicate-json', ['root', 'workspace', 'baseline', '--json', '--json']],
    ['leading-json', ['--json', 'root', 'workspace', 'baseline']],
    ['reordered-json', ['root', '--json', 'workspace', 'baseline']],
    ['unknown-option', ['root', 'workspace', 'baseline', '--nope', '--json']],
    ['missing-mode', ['root', 'workspace', '--json']],
  ])('rejects %s as machine usage', async (_label, args) => {
    const { runCli: invoke } = await import('../src/main.js');
    const result = await invoke(args, { cwd: 'D:/repo' });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe('');
    const payload = jsonRecord(result.stdout);
    expect(stringValue(payload, 'code')).toBe('EXERCISE_USAGE_001');
    expect(stringValue(payload, 'kind')).toBe('usage');
  });

  it('returns readable human usage without claiming machine output', async () => {
    const result = await runCli(['root', 'workspace', 'not-a-mode']);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('EXERCISE_USAGE_001');
    expect(result.stderr).toContain('Usage: exercise:verify');
    expect(result.stderr).not.toContain('{');
  });

  it('rejects an extra human argument without claiming machine output', async () => {
    const result = await runCli(['root', 'workspace', 'baseline', 'unexpected'], {
      cwd: 'D:/repo',
    });
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('EXERCISE_USAGE_001');
    expect(result.stderr).toContain('Usage: exercise:verify');
    expect(result.stderr).not.toContain('{');
  });

  it('publishes the accepted closure contract artifacts exactly', async () => {
    expect(
      await readFile(path.join(exerciseRoot, 'tests/open/counter.contract.test.js'), 'utf8'),
    ).toBe(
      [
        "import assert from 'node:assert/strict';",
        "import test from 'node:test';",
        "import { createCounter } from '../../src/counter.js';",
        '',
        "test('each counter preserves independent private state', () => {",
        '  const first = createCounter();',
        '  const second = createCounter();',
        '  for (let expected = 1; expected <= 10; expected += 1) {',
        '    assert.equal(first(), expected);',
        '  }',
        '  assert.equal(second(), 1);',
        '});',
        '',
      ].join('\n'),
    );
    expect(await readFile(path.join(exerciseRoot, 'hints/01-concept.md'), 'utf8')).toBe(
      [
        '# Gợi ý 1: Khái niệm',
        '',
        'Biến trạng thái phải thuộc lexical environment được tạo riêng mỗi lần gọi `createCounter`, không thuộc global scope.',
        '',
      ].join('\n'),
    );
    expect(await readFile(path.join(exerciseRoot, 'hints/02-diagnostic.md'), 'utf8')).toBe(
      [
        '# Gợi ý 2: Chẩn đoán',
        '',
        'Kiểm tra vị trí khai báo biến đếm. Nếu hai counter ảnh hưởng lẫn nhau, biến đang được chia sẻ ngoài lần gọi `createCounter`.',
        '',
      ].join('\n'),
    );
    expect(await readFile(path.join(exerciseRoot, 'hints/03-structure.md'), 'utf8')).toBe(
      [
        '# Gợi ý 3: Cấu trúc',
        '',
        '`createCounter` cần khai báo một biến cục bộ rồi trả về một function tăng và trả lại biến đó. Function trả về sẽ giữ lexical environment bằng closure.',
        '',
      ].join('\n'),
    );
    expect(await readFile(path.join(exerciseRoot, 'solution/src/counter.js'), 'utf8')).toBe(
      [
        'export function createCounter() {',
        '  let value = 0;',
        '  return function next() {',
        '    value += 1;',
        '    return value;',
        '  };',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('materializes a baseline, reports one machine object, and keeps the learner failure stable', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-cli-'));
    const workspace = path.join(parent, 'workspace');
    try {
      const baseline = await runCli([exerciseRoot, workspace, 'baseline', '--json']);
      expect(baseline.exitCode).toBe(0);
      expect(baseline.stderr).toBe('');
      const baselinePayload = jsonRecord(baseline.stdout);
      expect(stringValue(baselinePayload, 'status')).toBe('passed');
      const expectedLearnerFiles = [
        'package.json',
        'src/counter.js',
        'test/infrastructure.test.js',
        'test/open/counter.contract.test.js',
      ];
      const baselineManifest = jsonRecord(
        await readFile(path.join(workspace, '.roadmap', 'exercise-baseline.json'), 'utf8'),
      );
      const records = baselineRecords(baselineManifest);
      expect(records.map((record) => record.path)).toEqual(expectedLearnerFiles);
      for (const record of records) {
        const bytes = await readFile(path.join(workspace, record.path));
        expect(record.bytes).toBe(bytes.byteLength);
        expect(record.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
      }
      expect(await exists(path.join(workspace, '.roadmap', 'exercise-baseline.json'))).toBe(true);
      expect(await exists(path.join(workspace, 'node_modules'))).toBe(false);
      expect(await exists(path.join(workspace, 'pnpm-lock.yaml'))).toBe(false);
      expect(await exists(path.join(workspace, 'exercise.yaml'))).toBe(false);
      expect(await exists(path.join(workspace, 'README.vi.md'))).toBe(false);
      expect(await exists(path.join(workspace, 'hints'))).toBe(false);
      expect(await exists(path.join(workspace, 'solution'))).toBe(false);
      expect(await exists(path.join(workspace, 'walkthrough'))).toBe(false);
      expect(await fileInventory(workspace)).toEqual([
        '.roadmap/exercise-baseline.json',
        ...expectedLearnerFiles,
      ]);

      const learner = await runCli([exerciseRoot, workspace, 'learner', '--json']);
      expect(learner.exitCode).toBe(1);
      expect(learner.stderr).toBe('');
      const learnerPayload = jsonRecord(learner.stdout);
      expect(stringValue(learnerPayload, 'status')).toBe('failed');
      expect(diagnosticCodes(learnerPayload)).toContain('EXERCISE_COMMAND_001');
      const learnerSteps = learnerPayload.steps;
      if (!isUnknownArray(learnerSteps) || learnerSteps.length !== 1) {
        throw new Error('Expected one learner command step');
      }
      const learnerStep = learnerSteps[0];
      if (!isRecord(learnerStep)) throw new Error('Expected learner step object');
      expect(Object.keys(learnerStep).sort()).toEqual(['command', 'id', 'required']);
      const command = learnerStep.command;
      if (!isRecord(command)) throw new Error('Expected learner command result');
      expect(Object.keys(command).sort()).toEqual([
        'command',
        'durationMs',
        'exitCode',
        'signal',
        'stderr',
        'stdout',
        'timedOut',
      ]);
      expect(learner.stdout).not.toContain(path.resolve(parent));
      expect(await exists(path.join(workspace, '.roadmap', 'exercise-baseline.json'))).toBe(true);
      await copyFile(
        path.join(exerciseRoot, 'solution/src/counter.js'),
        path.join(workspace, 'src/counter.js'),
      );
      const reference = await runCli([exerciseRoot, workspace, 'learner', '--json']);
      expect(reference.exitCode).toBe(0);
      expect(stringValue(jsonRecord(reference.stdout), 'status')).toBe('passed');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('preserves an existing empty output and maps it to output ownership failure', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-empty-'));
    const workspace = path.join(parent, 'workspace');
    await mkdir(workspace);
    const calls = { value: 0 };
    try {
      const result = await runCli([exerciseRoot, workspace, 'baseline', '--json'], {
        dependencies: lifecycleDependencies(calls),
      });
      expect(result.exitCode).toBe(1);
      expect(diagnosticCodes(jsonRecord(result.stdout))).toContain('EXERCISE_OUTPUT_002');
      expect(calls.value).toBe(0);
      expect((await lstat(workspace)).isDirectory()).toBe(true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('preserves an existing non-empty unknown output and sentinel bytes', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-unknown-'));
    const workspace = path.join(parent, 'workspace');
    const sentinel = path.join(workspace, 'keep.txt');
    await mkdir(workspace);
    await writeFile(sentinel, 'foreign bytes', 'utf8');
    const calls = { value: 0 };
    try {
      const result = await runCli([exerciseRoot, workspace, 'baseline', '--json'], {
        dependencies: lifecycleDependencies(calls),
      });
      expect(result.exitCode).toBe(1);
      expect(diagnosticCodes(jsonRecord(result.stdout))).toContain('EXERCISE_OUTPUT_002');
      expect(calls.value).toBe(0);
      expect(await readFile(sentinel, 'utf8')).toBe('foreign bytes');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('reopens a valid workspace without rematerializing or changing learner bytes', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-reopen-'));
    const workspace = path.join(parent, 'workspace');
    const calls = { value: 0 };
    try {
      const dependencies = lifecycleDependencies(calls);
      const first = await runCli([exerciseRoot, workspace, 'baseline', '--json'], { dependencies });
      expect(first.exitCode).toBe(0);
      const sourceFile = path.join(workspace, 'src', 'counter.js');
      const before = await readFile(sourceFile);
      const second = await runCli([exerciseRoot, workspace, 'baseline', '--json'], {
        dependencies,
      });
      expect(second.exitCode).toBe(0);
      expect(calls.value).toBe(2);
      expect(await readFile(sourceFile)).toEqual(before);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects a protected mutation before any learner command runs', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-protected-'));
    const workspace = path.join(parent, 'workspace');
    const calls = { value: 0 };
    const dependencies = lifecycleDependencies(calls);
    try {
      const first = await runCli([exerciseRoot, workspace, 'baseline', '--json'], {
        dependencies,
      });
      expect(first.exitCode).toBe(0);
      await writeFile(path.join(workspace, 'package.json'), 'changed protected package\n', 'utf8');
      const result = await runCli([exerciseRoot, workspace, 'learner', '--json'], {
        dependencies,
      });
      expect(result.exitCode).toBe(1);
      const payload = jsonRecord(result.stdout);
      expect(diagnosticCodes(payload)).toContain('EXERCISE_WORKSPACE_001');
      expect(payload.steps).toBeUndefined();
      expect(calls.value).toBe(1);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects corrupt baseline provenance without destructive repair', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-corrupt-'));
    const workspace = path.join(parent, 'workspace');
    const calls = { value: 0 };
    const dependencies = lifecycleDependencies(calls);
    try {
      const first = await runCli([exerciseRoot, workspace, 'baseline', '--json'], {
        dependencies,
      });
      expect(first.exitCode).toBe(0);
      const baselineFile = path.join(workspace, '.roadmap', 'exercise-baseline.json');
      const original = await readFile(baselineFile, 'utf8');
      await writeFile(baselineFile, '{"schemaVersion":1}\n', 'utf8');
      const result = await runCli([exerciseRoot, workspace, 'baseline', '--json'], {
        dependencies,
      });
      expect(result.exitCode).toBe(1);
      expect(diagnosticCodes(jsonRecord(result.stdout))).toContain('EXERCISE_WORKSPACE_002');
      expect(await readFile(baselineFile, 'utf8')).not.toBe(original);
      expect(calls.value).toBe(1);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('maps missing and syntactically malformed metadata to nonleaking load failure', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-task5-loader-'));
    const missingWorkspace = path.join(parent, 'missing-workspace');
    try {
      const missing = await runCli([
        path.join(parent, 'missing-source'),
        missingWorkspace,
        'baseline',
        '--json',
      ]);
      expect(missing.exitCode).toBe(1);
      expect(diagnosticCodes(jsonRecord(missing.stdout))).toContain('EXERCISE_LOAD_001');
      expect(missing.stdout).not.toContain(parent);

      const malformedSource = path.join(parent, 'malformed-source');
      await mkdir(malformedSource);
      await writeFile(path.join(malformedSource, 'exercise.yaml'), 'schemaVersion: [', 'utf8');
      const malformed = await runCli([
        malformedSource,
        path.join(parent, 'malformed-workspace'),
        'baseline',
        '--json',
      ]);
      expect(malformed.exitCode).toBe(1);
      expect(diagnosticCodes(jsonRecord(malformed.stdout))).toContain('EXERCISE_LOAD_001');
      expect(malformed.stdout).not.toContain('YAMLParseError');
      expect(malformed.stdout).not.toContain(parent);

      const schemaInvalidSource = path.join(parent, 'schema-invalid-source');
      await mkdir(schemaInvalidSource);
      const canonicalMetadata = await readFile(path.join(exerciseRoot, 'exercise.yaml'), 'utf8');
      await writeFile(
        path.join(schemaInvalidSource, 'exercise.yaml'),
        canonicalMetadata.replace(
          'forbiddenDependencies: []',
          'forbiddenDependencies:\n  - node:fs',
        ),
        'utf8',
      );
      const schemaInvalid = await runCli([
        schemaInvalidSource,
        path.join(parent, 'schema-invalid-workspace'),
        'baseline',
        '--json',
      ]);
      expect(schemaInvalid.exitCode).toBe(1);
      const schemaPayload = jsonRecord(schemaInvalid.stdout);
      expect(diagnosticCodes(schemaPayload)).toContain('EXERCISE_SCHEMA_001');
      expect(schemaPayload.diagnostics).toBeDefined();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('maps unexpected dependency failures to an opaque internal result', async () => {
    const result = await runCli(['root', 'workspace', 'baseline', '--json'], {
      dependencies: {
        loadExercise: () => {
          throw new Error('SECRET_RAW_EXCEPTION');
        },
      },
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr).toBe('');
    expect(result.stdout).not.toContain('SECRET_RAW_EXCEPTION');
    expect(result.stdout).not.toContain('D:/');
    const payload = jsonRecord(result.stdout);
    expect(stringValue(payload, 'status')).toBe('internal-error');
    expect(diagnosticCodes(payload)).toEqual(['EXERCISE_INTERNAL_001']);
  });

  it('uses the curriculum loader and graph declaration surface for ownership', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) throw new Error('Canonical curriculum must load');
    const exercise = await loadExercise(exerciseRoot);
    expect(exercise.ok).toBe(true);
    if (!exercise.ok) throw new Error('Canonical exercise must load');
    const ownership = validateExerciseOwnership(corpus.value.documents, exercise.value.id);
    expect(ownership.ok).toBe(true);
    expect(ownership.lessonReferences).toEqual(['exercises.0']);
    expect(ownership.assessmentReferences).toEqual(['artifact']);
  });

  it('rejects missing, stale, and reversed in-memory curriculum declarations', async () => {
    const corpus = await loadCurriculum(curriculumRoot);
    expect(corpus.ok).toBe(true);
    if (!corpus.ok) throw new Error('Canonical curriculum must load');
    const exercise = await loadExercise(exerciseRoot);
    expect(exercise.ok).toBe(true);
    if (!exercise.ok) throw new Error('Canonical exercise must load');
    const documents = corpus.value.documents;
    const missingLesson = documents.filter(
      (document) => document.data.id !== 'lesson-js-closure-private-state',
    );
    expect(validateExerciseOwnership(missingLesson, exercise.value.id).ok).toBe(false);
    const missingAssessment = documents.filter(
      (document) => document.data.id !== 'assessment-js-closure',
    );
    expect(validateExerciseOwnership(missingAssessment, exercise.value.id).ok).toBe(false);

    const stale = documents.map((document) => {
      if (document.data.id !== 'lesson-js-closure-private-state') return document;
      if (document.data.kind !== 'lesson') return document;
      return {
        ...document,
        data: { ...document.data, exercises: ['ex-js-stale'] },
      };
    });
    expect(validateExerciseOwnership(stale, exercise.value.id).ok).toBe(false);

    const staleAssessment = documents.map((document) => {
      if (document.data.id !== 'assessment-js-closure') return document;
      if (document.data.kind !== 'assessment') return document;
      return {
        ...document,
        data: { ...document.data, artifact: 'ex-js-stale' },
      };
    });
    expect(validateExerciseOwnership(staleAssessment, exercise.value.id).ok).toBe(false);

    const reversedLesson = documents.map((document) => {
      if (document.data.id !== 'lesson-js-closure-private-state') return document;
      if (document.data.kind !== 'lesson') return document;
      return {
        ...document,
        data: { ...document.data, exercises: ['assessment-js-closure'] },
      };
    });
    expect(validateExerciseOwnership(reversedLesson, exercise.value.id).ok).toBe(false);

    const reversedAssessment = documents.map((document) => {
      if (document.data.id !== 'assessment-js-closure') return document;
      if (document.data.kind !== 'assessment') return document;
      return {
        ...document,
        data: { ...document.data, artifact: 'lesson-js-closure-private-state' },
      };
    });
    expect(validateExerciseOwnership(reversedAssessment, exercise.value.id).ok).toBe(false);
  });

  it('projects representative diagnostics to the three owned documentation files', async () => {
    const loaded = await loadExercise(exerciseRoot);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error('Canonical exercise must load');
    const cases = [
      ['EXERCISE_LOAD_001', 'docs/authoring/exercises.md'],
      ['EXERCISE_COMMAND_001', 'docs/learner/exercise-workflow.md'],
      ['EXERCISE_INTERNAL_001', 'docs/maintainers/verifier-failures.md'],
    ] as const;
    for (const [code, documentation] of cases) {
      const result = await runCli(['root', 'tooling/verify-exercise', 'baseline', '--json'], {
        cwd: repoRoot,
        dependencies: projectionDependencies(loaded, code),
      });
      expect(result.exitCode).toBe(1);
      const diagnostic = firstDiagnostic(jsonRecord(result.stdout));
      expect(diagnostic).toEqual({
        code,
        severity: 'error',
        location: { file: 'fixture.yaml', line: 7, column: 3, pointer: '/fixture' },
        observed: 'observed-value',
        expected: 'expected-value',
        reason: 'reason-value',
        remediation: 'remediation-value',
        documentation,
      });
    }
  });

  it('provides actionable learner and owner documentation without solution leakage', async () => {
    const readme = await readFile(path.join(exerciseRoot, 'README.vi.md'), 'utf8');
    expect(readme).toContain('`src/counter.js`');
    expect(readme).toContain('baseline');
    expect(readme).toContain('learner');
    expect(readme).toContain('hints/01-concept.md');
    expect(readme).toContain('solution');
    expect(readme).not.toContain('let value = 0');

    const walkthrough = await readFile(path.join(exerciseRoot, 'walkthrough/README.vi.md'), 'utf8');
    expect(walkthrough).toContain('lexical environment');
    expect(walkthrough).toContain('global');
    expect(walkthrough).toContain('module');
    expect(walkthrough).toContain('Reference implementation');
    expect(walkthrough).toContain('không phải');

    const authoring = await readFile(path.join(repoRoot, 'docs/authoring/exercises.md'), 'utf8');
    expect(authoring).toContain('`editablePaths`');
    expect(authoring).toContain('`commands`');
    expect(authoring).toContain('glob');
    expect(authoring).toContain('empty');
    expect(authoring).toContain('curriculum');

    const learner = await readFile(
      path.join(repoRoot, 'docs/learner/exercise-workflow.md'),
      'utf8',
    );
    expect(learner).toContain('baseline');
    expect(learner).toContain('learner');
    expect(learner).toContain('solution');
    expect(learner).toContain('hints');
    expect(learner).toContain('metadata');

    const maintainer = await readFile(
      path.join(repoRoot, 'docs/maintainers/verifier-failures.md'),
      'utf8',
    );
    for (const exitCode of ['0', '1', '2', '3']) expect(maintainer).toContain(`exit ${exitCode}`);
    expect(maintainer).toContain('uncertain cleanup');
    expect(maintainer).toContain('escalate');
  });

  it('verifies projected documentation files and every local Markdown link', async () => {
    const documentationFiles = [
      path.join(repoRoot, 'docs/authoring/exercises.md'),
      path.join(repoRoot, 'docs/learner/exercise-workflow.md'),
      path.join(repoRoot, 'docs/maintainers/verifier-failures.md'),
    ];
    for (const file of documentationFiles) {
      expect(await exists(file)).toBe(true);
      const text = await readFile(file, 'utf8');
      const links = [...text.matchAll(/\]\(([^)]+)\)/g)];
      for (const link of links) {
        const target = link[1];
        if (target === undefined || target.startsWith('http')) continue;
        const targetPath = path.resolve(path.dirname(file), target.split('#')[0] ?? target);
        expect(await exists(targetPath)).toBe(true);
      }
    }
    expect(await exists(path.join(repoRoot, 'docs/authoring/remediation.md'))).toBe(false);
  });
});
