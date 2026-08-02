import { lstat, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CommandRunnerError, type CommandResult, type CommandSpec } from '@roadmap/command-runner';
import { loadExercise, materializeExercise, verifyExercise } from '../src/index.js';
import { verifyExerciseWithRunnerForTest } from '../src/verify-exercise.js';
import type { ExerciseDefinition } from '@roadmap/exercise-contract';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

async function prepareWorkspace() {
  const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-verify-task4-'));
  const output = path.join(parent, 'workspace');
  const materialized = await materializeExercise(fixture, output);
  const definition = await loadExercise(fixture);
  if (!materialized.ok || !definition.ok) {
    await rm(parent, { recursive: true, force: true });
    throw new Error('Task 3 fixture must materialize and load');
  }
  return { parent, output, workspace: materialized.value, definition: definition.value };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function completedResult(
  spec: CommandSpec,
  exitCode: number | null = 0,
  timedOut = false,
  signal: NodeJS.Signals | null = null,
): CommandResult {
  return {
    command: spec,
    exitCode,
    signal,
    timedOut,
    stdout: '',
    stderr: exitCode === 0 ? '' : 'command failed\n',
    durationMs: 1,
  };
}

function withBaselineCommands(
  definition: ExerciseDefinition,
  baseline: ExerciseDefinition['commands']['baseline'],
): ExerciseDefinition {
  return { ...definition, commands: { ...definition.commands, baseline } };
}

function firstBaseline(definition: ExerciseDefinition) {
  const first = definition.commands.baseline[0];
  if (first === undefined) throw new Error('Accepted fixture must define a baseline command');
  return first;
}

describe('verifyExercise', () => {
  it('keeps one persistent workspace protected between public baseline and learner verification', async () => {
    const prepared = await prepareWorkspace();
    try {
      const baseline = await verifyExercise(prepared.definition, prepared.workspace, 'baseline');
      expect(baseline.status).toBe('passed');
      expect(baseline.steps).toHaveLength(1);
      expect(baseline.steps[0]?.command.command.command).toBe('pnpm');
      expect(baseline.steps[0]?.command.exitCode).toBe(0);
      expect(await pathExists(path.join(prepared.output, 'pnpm-lock.yaml'))).toBe(false);
      expect(await pathExists(path.join(prepared.output, 'node_modules'))).toBe(false);
      expect(baseline.steps[0]?.command.command.args).toEqual([
        '--config.verifyDepsBeforeRun=false',
        'test:infrastructure',
      ]);

      const learner = await verifyExercise(prepared.definition, prepared.workspace, 'learner');
      expect(learner.status).toBe('failed');
      expect(learner.steps).toHaveLength(1);
      expect(learner.steps[0]?.command.command.command).toBe('pnpm');
      expect(learner.steps[0]?.command.command.args).toEqual([
        '--config.verifyDepsBeforeRun=false',
        'verify',
      ]);
      expect(learner.diagnostics[0]?.code).toBe('EXERCISE_COMMAND_001');
      expect(await pathExists(path.join(prepared.output, 'pnpm-lock.yaml'))).toBe(false);
      expect(await pathExists(path.join(prepared.output, 'node_modules'))).toBe(false);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  }, 15_000);

  it('blocks every command when a protected file changes', async () => {
    const prepared = await prepareWorkspace();
    let calls = 0;
    try {
      const protectedFile = path.join(prepared.output, 'test/open/counter.contract.test.js');
      await writeFile(protectedFile, '// protected mutation\n');
      const report = await verifyExerciseWithRunnerForTest(
        prepared.definition,
        prepared.workspace,
        'learner',
        (spec) => {
          calls += 1;
          return Promise.resolve(completedResult(spec));
        },
      );
      expect(report.status).toBe('failed');
      expect(report.steps).toHaveLength(0);
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
      expect(calls).toBe(0);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('composes copied argv, canonical root and nested CWDs in sequential order', async () => {
    const prepared = await prepareWorkspace();
    const first = firstBaseline(prepared.definition);
    const second = { ...first, id: 'nested', cwd: 'src' };
    const definition = withBaselineCommands(prepared.definition, [first, second]);
    const calls: CommandSpec[] = [];
    try {
      const report = await verifyExerciseWithRunnerForTest(
        definition,
        prepared.workspace,
        'baseline',
        (spec) => {
          calls.push(spec);
          return Promise.resolve(completedResult(spec));
        },
      );
      expect(report.status).toBe('passed');
      expect(calls.map((spec) => spec.command)).toEqual(['pnpm', 'pnpm']);
      expect(calls.map((spec) => spec.args)).toEqual([
        ['--config.verifyDepsBeforeRun=false', 'test:infrastructure'],
        ['--config.verifyDepsBeforeRun=false', 'test:infrastructure'],
      ]);
      expect(calls[0]?.cwd).toBe(path.resolve(prepared.output));
      expect(calls[1]?.cwd).toBe(path.resolve(prepared.output, 'src'));
      expect(calls.map((spec) => spec.timeoutMs)).toEqual([60000, 60000]);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('stops after the first required completed failure', async () => {
    const prepared = await prepareWorkspace();
    const first = firstBaseline(prepared.definition);
    const second = { ...first, id: 'later' };
    const definition = withBaselineCommands(prepared.definition, [first, second]);
    let calls = 0;
    try {
      const report = await verifyExerciseWithRunnerForTest(
        definition,
        prepared.workspace,
        'baseline',
        (spec) => {
          calls += 1;
          return Promise.resolve(completedResult(spec, 1));
        },
      );
      expect(report.status).toBe('failed');
      expect(report.steps).toHaveLength(1);
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_COMMAND_001');
      expect(report.diagnostics[0]?.location.pointer).toBe('/commands/baseline/infrastructure');
      expect(calls).toBe(1);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('records an optional failure and continues to the next required command', async () => {
    const prepared = await prepareWorkspace();
    const first = { ...firstBaseline(prepared.definition), required: false };
    const second = { ...firstBaseline(prepared.definition), id: 'required-later' };
    const definition = withBaselineCommands(prepared.definition, [first, second]);
    const order: string[] = [];
    try {
      const report = await verifyExerciseWithRunnerForTest(
        definition,
        prepared.workspace,
        'baseline',
        (spec) => {
          order.push(spec.args[1] ?? 'missing');
          return Promise.resolve(completedResult(spec, order.length === 1 ? 1 : 0));
        },
      );
      expect(report.status).toBe('passed');
      expect(report.steps).toHaveLength(2);
      expect(order).toEqual(['test:infrastructure', 'test:infrastructure']);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('stops on a required timeout and records the timed-out result', async () => {
    const prepared = await prepareWorkspace();
    try {
      const report = await verifyExerciseWithRunnerForTest(
        prepared.definition,
        prepared.workspace,
        'baseline',
        (spec) => Promise.resolve(completedResult(spec, null, true)),
      );
      expect(report.status).toBe('failed');
      expect(report.steps).toHaveLength(1);
      expect(report.steps[0]?.command.timedOut).toBe(true);
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_COMMAND_002');
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it.each(['SIGLOST', 'SIGINFO'] as const)(
    'preserves valid signal %s under the canonical command step field',
    async (signal) => {
      const prepared = await prepareWorkspace();
      try {
        const report = await verifyExerciseWithRunnerForTest(
          prepared.definition,
          prepared.workspace,
          'baseline',
          (spec) => Promise.resolve(completedResult(spec, null, false, signal)),
        );
        const step = report.steps[0];
        expect(report.status).toBe('failed');
        expect(report.diagnostics[0]?.code).toBe('EXERCISE_COMMAND_001');
        expect(Object.keys(step ?? {}).sort()).toEqual(['command', 'id', 'required']);
        expect(step?.command.signal).toBe(signal);
        expect('result' in (step ?? {})).toBe(false);
      } finally {
        await rm(prepared.parent, { recursive: true, force: true });
      }
    },
  );

  it.each([
    ['SPAWN_FAILED', 'EXERCISE_COMMAND_003'],
    ['OUTPUT_LIMIT_EXCEEDED', 'EXERCISE_COMMAND_004'],
    ['CLEANUP_FAILED', 'EXERCISE_COMMAND_005'],
  ] as const)(
    'maps typed runner rejection %s without raw text',
    async (errorCode, diagnosticCode) => {
      const prepared = await prepareWorkspace();
      try {
        const report = await verifyExerciseWithRunnerForTest(
          prepared.definition,
          prepared.workspace,
          'baseline',
          () => Promise.reject(new CommandRunnerError(errorCode, 'SECRET_INJECTED_ERROR_TEXT')),
        );
        expect(report.status).toBe('failed');
        expect(report.steps).toHaveLength(0);
        expect(report.diagnostics[0]?.code).toBe(diagnosticCode);
        expect(JSON.stringify(report.diagnostics)).not.toContain('SECRET_INJECTED_ERROR_TEXT');
        expect(report.diagnostics[0]?.location.pointer).toBe('/commands/baseline/infrastructure');
      } finally {
        await rm(prepared.parent, { recursive: true, force: true });
      }
    },
  );

  it.each(['INVALID_SPEC', 'unexpected'])('maps %s to opaque internal error', async (kind) => {
    const prepared = await prepareWorkspace();
    try {
      const report = await verifyExerciseWithRunnerForTest(
        prepared.definition,
        prepared.workspace,
        'baseline',
        () => {
          if (kind === 'INVALID_SPEC') {
            return Promise.reject(new CommandRunnerError('INVALID_SPEC', 'SECRET_INVALID_SPEC'));
          }
          return Promise.reject(new Error('SECRET_UNEXPECTED_ERROR'));
        },
      );
      expect(report.status).toBe('internal-error');
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_INTERNAL_001');
      expect(JSON.stringify(report.diagnostics)).not.toContain('SECRET_');
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects a CWD traversal before entering the runner', async () => {
    const prepared = await prepareWorkspace();
    let calls = 0;
    const step = { ...firstBaseline(prepared.definition), cwd: '../outside' };
    const definition = withBaselineCommands(prepared.definition, [step]);
    try {
      const report = await verifyExerciseWithRunnerForTest(
        definition,
        prepared.workspace,
        'baseline',
        (spec) => {
          calls += 1;
          return Promise.resolve(completedResult(spec));
        },
      );
      expect(report.status).toBe('internal-error');
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_INTERNAL_001');
      expect(report.diagnostics[0]?.location.pointer).toBe('/commands/baseline/infrastructure');
      expect(JSON.stringify(report.diagnostics)).not.toContain('outside');
      expect(calls).toBe(0);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects a CWD symlink or junction escape before entering the runner', async () => {
    const prepared = await prepareWorkspace();
    const outside = path.join(prepared.parent, 'outside');
    const alias = path.join(prepared.parent, 'outside-alias');
    let calls = 0;
    try {
      await mkdir(outside);
      await symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
      const step = { ...firstBaseline(prepared.definition), cwd: '../outside-alias' };
      const definition = withBaselineCommands(prepared.definition, [step]);
      const report = await verifyExerciseWithRunnerForTest(
        definition,
        prepared.workspace,
        'baseline',
        (spec) => {
          calls += 1;
          return Promise.resolve(completedResult(spec));
        },
      );
      expect(report.status).toBe('internal-error');
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_INTERNAL_001');
      expect(calls).toBe(0);
    } finally {
      await unlink(alias).catch(() => undefined);
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects wrong-case CWD spelling before entering the runner', async () => {
    const prepared = await prepareWorkspace();
    let calls = 0;
    const step = { ...firstBaseline(prepared.definition), cwd: 'SRC' };
    const definition = withBaselineCommands(prepared.definition, [step]);
    try {
      const report = await verifyExerciseWithRunnerForTest(
        definition,
        prepared.workspace,
        'baseline',
        (spec) => {
          calls += 1;
          return Promise.resolve(completedResult(spec));
        },
      );
      expect(report.status).toBe('internal-error');
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_INTERNAL_001');
      expect(calls).toBe(0);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects an invalid runtime mode and keeps the public runtime export surface exact', async () => {
    const prepared = await prepareWorkspace();
    try {
      const report = await verifyExerciseWithRunnerForTest(
        prepared.definition,
        prepared.workspace,
        'other',
        (spec) => Promise.resolve(completedResult(spec)),
      );
      expect(report.status).toBe('internal-error');
      expect(report.diagnostics[0]?.code).toBe('EXERCISE_INTERNAL_001');
      const publicSurface = await import('../src/index.js');
      expect(Object.keys(publicSurface).sort()).toEqual([
        'loadExercise',
        'materializeExercise',
        'openExerciseWorkspace',
        'readBaselineManifest',
        'resolveExerciseRoot',
        'verifyEditablePaths',
        'verifyExercise',
        'writeBaselineManifest',
      ]);
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });
});
