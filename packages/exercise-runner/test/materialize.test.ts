import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createProductionMaterializeFilesystemAdapter,
  type MaterializeFilesystemAdapter,
} from '../src/materialization-filesystem.js';
import {
  materializeExercise,
  materializeExerciseWithFilesystemForTest,
} from '../src/materialize.js';
import { readBaselineManifest } from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

type LifecycleFailureMode =
  | 'target-appears-during-reservation'
  | 'target-alias-during-reservation'
  | 'partial-population'
  | 'stage-cleanup-refusal'
  | 'finalization-failure'
  | 'unexpected-reservation-content';

interface OperationTrace {
  events: string[];
  stageRoot?: string;
  stageControlPaths?: readonly string[];
  reservationRoot?: string;
  reservationControlPaths?: readonly string[];
  stageAbsentAtFinalization?: boolean;
  finalizerDelegated?: boolean;
  aliasForeignRoot?: string;
  partialLearnerEntryCreatedAtFailure?: boolean;
}

function createTestOnlyLifecycleFilesystemAdapter(
  failureMode: LifecycleFailureMode | undefined,
  trace: OperationTrace,
): MaterializeFilesystemAdapter {
  const production = createProductionMaterializeFilesystemAdapter();
  const productionFinalize = production.finalizeOwnedReservation.bind(production);
  production.finalizeOwnedReservation = async (reservation, options) => {
    trace.finalizerDelegated = true;
    return productionFinalize(reservation, options);
  };
  return {
    inspectOutputState: async (target) => {
      trace.events.push('inspect');
      return production.inspectOutputState(target);
    },
    createOwnedStage: async (parent, prefix, starterRoot, openTestsRoot) => {
      trace.events.push('stage:create');
      const stage = await production.createOwnedStage(parent, prefix, starterRoot, openTestsRoot);
      trace.stageRoot = stage.root;
      trace.stageControlPaths = stage.controlPaths;
      return stage;
    },
    reserveMissingDirectory: async (target, expectedInventory) => {
      trace.events.push('reserve:begin');
      if (failureMode === 'target-appears-during-reservation') {
        await mkdir(target);
        await writeFile(path.join(target, 'foreign-target.txt'), 'preserve exact target bytes\n');
        trace.reservationRoot = target;
      }
      if (failureMode === 'target-alias-during-reservation') {
        const foreignRoot = path.join(path.dirname(target), 'foreign-target');
        await mkdir(foreignRoot);
        await writeFile(path.join(foreignRoot, 'foreign.txt'), 'preserve alias bytes\n');
        await symlink(foreignRoot, target, process.platform === 'win32' ? 'junction' : 'dir');
        trace.aliasForeignRoot = foreignRoot;
      }
      try {
        const reservation = await production.reserveMissingDirectory(target, expectedInventory);
        trace.reservationRoot = reservation.root;
        trace.reservationControlPaths = reservation.controlPaths;
        trace.events.push('reserve:success');
        return reservation;
      } catch (error) {
        trace.events.push(
          failureMode === 'target-appears-during-reservation'
            ? 'reserve:collision'
            : 'reserve:failure',
        );
        throw error;
      }
    },
    populateReservedDirectory: async (stage, reservation, options) => {
      trace.events.push('populate:begin');
      let partialEntry: string | undefined;
      try {
        if (failureMode === 'partial-population') {
          const learnerEntries = reservation.expectedInventory.filter(
            (entry) => !reservation.controlPaths.includes(entry),
          );
          const firstEntry = learnerEntries[0];
          const laterEntry = learnerEntries[1];
          if (!firstEntry || !laterEntry) {
            throw new Error('fixture must contain at least two learner entries');
          }
          partialEntry = firstEntry;
          await rm(path.join(stage.root, laterEntry), { force: true });
        }
        await production.populateReservedDirectory(stage, reservation, options);
        trace.events.push('populate:success');
      } catch (error) {
        if (partialEntry) {
          trace.partialLearnerEntryCreatedAtFailure = await stat(
            path.join(reservation.root, partialEntry),
          ).then(
            () => true,
            () => false,
          );
        }
        trace.events.push('populate:failure');
        throw error;
      }
    },
    validateOwnedInventory: async (reservation) => {
      trace.events.push('inventory:begin');
      if (failureMode === 'unexpected-reservation-content') {
        await writeFile(
          path.join(reservation.root, 'foreign-reservation.txt'),
          'preserve exact reservation bytes\n',
        );
      }
      try {
        await production.validateOwnedInventory(reservation);
        trace.events.push('inventory:success');
      } catch (error) {
        trace.events.push('inventory:failure');
        throw error;
      }
    },
    removeOwnedStage: async (stage, expectedInventory, options) => {
      trace.events.push('stage:cleanup:begin');
      if (failureMode === 'stage-cleanup-refusal') {
        await writeFile(path.join(stage.root, 'foreign-stage.txt'), 'preserve exact stage bytes\n');
      }
      try {
        await production.removeOwnedStage(stage, expectedInventory, options);
        trace.events.push('stage:cleanup:success');
      } catch (error) {
        trace.events.push('stage:cleanup:refusal');
        throw error;
      }
    },
    finalizeOwnedReservation: async (reservation, options) => {
      trace.events.push('finalize:begin');
      try {
        if (failureMode === 'finalization-failure') {
          if (!trace.stageRoot) throw new Error('stage root must be recorded before finalization');
          const expectedLearnerPath = options.expectedInventory.find(
            (entry) => !options.controlPaths.includes(entry),
          );
          if (!expectedLearnerPath) throw new Error('finalization needs an expected learner path');
          await rm(path.join(reservation.root, ...expectedLearnerPath.split('/')), {
            force: false,
          });
          trace.stageAbsentAtFinalization = await stat(trace.stageRoot).then(
            () => false,
            () => true,
          );
          await production.finalizeOwnedReservation(reservation, options);
        } else {
          await production.finalizeOwnedReservation(reservation, options);
        }
        trace.events.push('finalize:success');
      } catch (error) {
        trace.events.push('finalize:failure');
        throw error;
      }
    },
    cleanupOwnedMaterialization: async (stage, reservation, options) => {
      trace.events.push('cleanup:begin');
      try {
        await production.cleanupOwnedMaterialization(stage, reservation, options);
        trace.events.push('cleanup:success');
      } catch (error) {
        trace.events.push('cleanup:refused');
        throw error;
      }
    },
  };
}

async function runLifecycleCase(failureMode: LifecycleFailureMode) {
  const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-' + failureMode + '-'));
  const output = path.join(parent, 'workspace');
  const sentinel = path.join(parent, 'unrelated.sentinel');
  await writeFile(sentinel, 'preserve unrelated content\n');
  const trace: OperationTrace = { events: [] };
  const adapter = createTestOnlyLifecycleFilesystemAdapter(failureMode, trace);
  const result = await materializeExerciseWithFilesystemForTest(fixture, output, adapter);
  return { parent, output, sentinel, trace, result };
}

describe('materializeExercise actual filesystem lifecycle', () => {
  it('records the production operation order on success', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-lifecycle-success-'));
    try {
      const output = path.join(parent, 'workspace');
      const trace: OperationTrace = { events: [] };
      const result = await materializeExerciseWithFilesystemForTest(
        fixture,
        output,
        createTestOnlyLifecycleFilesystemAdapter(undefined, trace),
      );
      expect(result.ok).toBe(true);
      expect(trace.events).toEqual([
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:success',
        'populate:begin',
        'populate:success',
        'inventory:begin',
        'inventory:success',
        'stage:cleanup:begin',
        'stage:cleanup:success',
        'finalize:begin',
        'finalize:success',
      ]);
      if (!result.ok) return;
      const stageControlPaths = trace.stageControlPaths;
      const reservationControlPaths = trace.reservationControlPaths;
      if (!stageControlPaths || stageControlPaths.length === 0) {
        throw new Error('success must expose stage control paths');
      }
      if (!reservationControlPaths || reservationControlPaths.length === 0) {
        throw new Error('success must expose reservation control paths');
      }
      const manifest = await readBaselineManifest(result.value.baselineManifestPath);
      expect(manifest.files.map((entry) => entry.path)).toEqual([
        'package.json',
        'src/counter.js',
        'test/infrastructure.test.js',
        'test/open/counter.contract.test.js',
      ]);
      for (const record of manifest.files) {
        const bytes = await readFile(path.join(output, ...record.path.split('/')));
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        expect(bytes.byteLength).toBe(record.bytes);
        expect(sha256).toBe(record.sha256);
        expect(sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      const manifestPaths = new Set(manifest.files.map((entry) => entry.path));
      for (const controlPath of [...stageControlPaths, ...reservationControlPaths]) {
        expect(manifestPaths.has(controlPath)).toBe(false);
        await expect(stat(path.join(output, controlPath))).rejects.toThrow();
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('keeps the public wrapper exactly two-argument and excludes solution and hints', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-'));
    try {
      const output = path.join(parent, 'workspace');
      const result = await materializeExercise(fixture, output);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toContain(
        'createCounter',
      );
      expect(
        await readFile(path.join(output, 'test/open/counter.contract.test.js'), 'utf8'),
      ).toContain('independent');
      await expect(stat(path.join(output, 'solution'))).rejects.toThrow();
      await expect(stat(path.join(output, 'hints'))).rejects.toThrow();
      const manifest = await readBaselineManifest(result.value.baselineManifestPath);
      expect(manifest.exerciseId).toBe('ex-js-closure-counter');
      expect(manifest.files.map((entry) => entry.path)).toEqual(
        expect.arrayContaining(['src/counter.js', 'test/open/counter.contract.test.js']),
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects an existing empty output without deleting it or creating a stage', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-existing-empty-'));
    try {
      const output = path.join(parent, 'workspace');
      await mkdir(output);
      const result = await materializeExercise(fixture, output);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_002');
      expect(await readdir(output)).toEqual([]);
      expect(
        (await readdir(parent)).filter((entry) => entry.startsWith('.roadmap-stage-')),
      ).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  const lifecycleCases = [
    {
      failureMode: 'target-appears-during-reservation',
      expectedCode: 'EXERCISE_OUTPUT_002',
      expectedEvents: [
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:collision',
        'cleanup:begin',
        'cleanup:success',
      ],
    },
    {
      failureMode: 'target-alias-during-reservation',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: [
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:failure',
        'cleanup:begin',
        'cleanup:success',
      ],
    },
    {
      failureMode: 'partial-population',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: [
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:success',
        'populate:begin',
        'populate:failure',
        'cleanup:begin',
        'cleanup:success',
      ],
    },
    {
      failureMode: 'stage-cleanup-refusal',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: [
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:success',
        'populate:begin',
        'populate:success',
        'inventory:begin',
        'inventory:success',
        'stage:cleanup:begin',
        'stage:cleanup:refusal',
        'cleanup:begin',
        'cleanup:refused',
      ],
    },
    {
      failureMode: 'finalization-failure',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: [
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:success',
        'populate:begin',
        'populate:success',
        'inventory:begin',
        'inventory:success',
        'stage:cleanup:begin',
        'stage:cleanup:success',
        'finalize:begin',
        'finalize:failure',
        'cleanup:begin',
        'cleanup:success',
      ],
    },
    {
      failureMode: 'unexpected-reservation-content',
      expectedCode: 'EXERCISE_OUTPUT_003',
      expectedEvents: [
        'inspect',
        'stage:create',
        'reserve:begin',
        'reserve:success',
        'populate:begin',
        'populate:success',
        'inventory:begin',
        'inventory:failure',
        'cleanup:begin',
        'cleanup:refused',
      ],
    },
  ] as const;

  it.each(lifecycleCases)(
    'proves the real $failureMode lifecycle boundary and ownership cleanup',
    async ({ failureMode, expectedCode, expectedEvents }) => {
      const { parent, output, sentinel, trace, result } = await runLifecycleCase(failureMode);
      try {
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.diagnostics[0]?.code).toBe(expectedCode);
        expect(trace.events).toEqual(expectedEvents);
        expect(await readFile(sentinel, 'utf8')).toBe('preserve unrelated content\n');
        if (failureMode === 'target-appears-during-reservation') {
          expect(await readFile(path.join(output, 'foreign-target.txt'), 'utf8')).toBe(
            'preserve exact target bytes\n',
          );
          expect(trace.events).not.toContain('populate:begin');
        }
        if (failureMode === 'partial-population') {
          expect(trace.partialLearnerEntryCreatedAtFailure).toBe(true);
          expect(trace.reservationRoot).toBeTruthy();
          expect(
            await stat(output).then(
              () => true,
              () => false,
            ),
          ).toBe(false);
          const stageRoot = trace.stageRoot;
          if (stageRoot)
            expect(
              await stat(stageRoot).then(
                () => true,
                () => false,
              ),
            ).toBe(false);
        }
        if (failureMode === 'stage-cleanup-refusal') {
          const stageRoot = trace.stageRoot;
          if (!stageRoot) throw new Error('stage root is required');
          expect(await readFile(path.join(stageRoot, 'foreign-stage.txt'), 'utf8')).toBe(
            'preserve exact stage bytes\n',
          );
          expect(
            await stat(output).then(
              () => true,
              () => false,
            ),
          ).toBe(false);
        }
        if (failureMode === 'finalization-failure') {
          expect(trace.finalizerDelegated).toBe(true);
          expect(trace.stageAbsentAtFinalization).toBe(true);
          expect(
            await stat(output).then(
              () => true,
              () => false,
            ),
          ).toBe(false);
        }
        if (failureMode === 'unexpected-reservation-content') {
          const stageRoot = trace.stageRoot;
          if (!stageRoot) throw new Error('stage root is required');
          expect(await readFile(path.join(output, 'foreign-reservation.txt'), 'utf8')).toBe(
            'preserve exact reservation bytes\n',
          );
          expect(
            await stat(stageRoot).then(
              () => true,
              () => false,
            ),
          ).toBe(false);
        }
        if (failureMode === 'target-alias-during-reservation') {
          const foreignRoot = trace.aliasForeignRoot;
          if (!foreignRoot) throw new Error('foreign alias root is required');
          expect(await readFile(path.join(foreignRoot, 'foreign.txt'), 'utf8')).toBe(
            'preserve alias bytes\n',
          );
        }
      } finally {
        if (failureMode === 'target-alias-during-reservation') {
          await unlink(output).catch(() => undefined);
        }
        await rm(parent, { recursive: true, force: true });
      }
    },
  );

  it('rejects source/output equality and nesting before lifecycle mutation', async () => {
    const sourceRoot = fileURLToPath(fixture);
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-source-output-'));
    try {
      const equal = await materializeExercise(sourceRoot, sourceRoot);
      expect(equal.ok).toBe(false);
      if (!equal.ok) expect(equal.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_001');
      const nested = await materializeExercise(sourceRoot, path.join(sourceRoot, 'workspace'));
      expect(nested.ok).toBe(false);
      if (!nested.ok) expect(nested.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_001');
      expect(
        await stat(path.join(sourceRoot, 'workspace')).then(
          () => true,
          () => false,
        ),
      ).toBe(false);
      expect(await stat(parent)).toBeTruthy();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects an output path whose existing ancestor is a symlink or junction alias', async () => {
    const outputParent = await mkdtemp(path.join(tmpdir(), 'roadmap-output-alias-'));
    const alias = path.join(outputParent, 'alias');
    try {
      await symlink(outputParent, alias, process.platform === 'win32' ? 'junction' : 'dir');
      const result = await materializeExercise(fixture, path.join(alias, 'workspace'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_001');
    } finally {
      await unlink(alias).catch(() => undefined);
      await rm(outputParent, { recursive: true, force: true });
    }
  });

  it('rejects a selected source root symlink or junction before canonicalization', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'roadmap-source-root-'));
    const sourceAlias = path.join(path.dirname(source), `${path.basename(source)}-alias`);
    const outputParent = await mkdtemp(path.join(tmpdir(), 'roadmap-source-root-output-'));
    try {
      await cp(fileURLToPath(fixture), source, { recursive: true });
      await symlink(source, sourceAlias, process.platform === 'win32' ? 'junction' : 'dir');
      const result = await materializeExercise(sourceAlias, path.join(outputParent, 'workspace'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
    } finally {
      await unlink(sourceAlias).catch(() => undefined);
      await rm(source, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });

  it('rejects source-under-output containment before filesystem mutation', async () => {
    const sourceRoot = fileURLToPath(fixture);
    const result = await materializeExercise(sourceRoot, path.dirname(sourceRoot));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_001');
  });

  it('rejects a Windows case-fold source/output alias before filesystem mutation', async () => {
    if (process.platform !== 'win32') return;
    const sourceRoot = fileURLToPath(fixture);
    const caseVariant = sourceRoot.toUpperCase();
    const result = await materializeExercise(sourceRoot, caseVariant);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_001');
  });

  it('rejects a mapped case-fold collision between starter and open tests', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'roadmap-case-collision-'));
    const outputParent = await mkdtemp(path.join(tmpdir(), 'roadmap-case-collision-output-'));
    try {
      await cp(fileURLToPath(fixture), source, { recursive: true });
      await mkdir(path.join(source, 'starter', 'test', 'open'), { recursive: true });
      await writeFile(
        path.join(source, 'starter', 'test', 'open', 'CaseCollision.js'),
        'starter\n',
      );
      await writeFile(path.join(source, 'tests', 'open', 'casecollision.js'), 'open\n');
      const result = await materializeExercise(source, path.join(outputParent, 'workspace'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });

  it('rejects a selected source junction or symlink as EXERCISE_PATH_001', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-source-'));
    const outputParent = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-output-'));
    const selectedAlias = path.join(source, 'starter', 'src', 'answer.js');
    const selectedDirectoryAlias = path.join(source, 'starter', 'src', 'answer-directory');
    try {
      await cp(fileURLToPath(fixture), source, { recursive: true });
      if (process.platform === 'win32') {
        await symlink(
          path.join(source, 'solution', 'src'),
          path.join(source, 'starter', 'src', 'answer-directory'),
          'junction',
        );
      } else {
        await symlink(
          path.join(source, 'solution', 'src', 'counter.js'),
          path.join(source, 'starter', 'src', 'answer.js'),
          'file',
        );
      }
      const result = await materializeExercise(source, path.join(outputParent, 'workspace'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
    } finally {
      await unlink(selectedAlias).catch(() => undefined);
      await unlink(selectedDirectoryAlias).catch(() => undefined);
      await rm(source, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });

  it('rejects allowlisted mapping collisions and source content in the reserved control namespace', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-collision-'));
    const outputParent = await mkdtemp(path.join(tmpdir(), 'roadmap-exercise-collision-output-'));
    try {
      await cp(fileURLToPath(fixture), source, { recursive: true });
      await mkdir(path.join(source, 'starter', 'test', 'open'), { recursive: true });
      await writeFile(path.join(source, 'starter', 'test', 'open', 'collision.js'), 'starter\n');
      await writeFile(path.join(source, 'tests', 'open', 'collision.js'), 'open\n');
      const collision = await materializeExercise(source, path.join(outputParent, 'collision'));
      expect(collision.ok).toBe(false);
      if (!collision.ok) expect(collision.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');

      await rm(path.join(source, 'starter', 'test', 'open'), { recursive: true, force: true });
      await mkdir(path.join(source, 'starter', '.roadmap'), { recursive: true });
      await writeFile(
        path.join(source, 'starter', '.roadmap', 'unexpected.txt'),
        'reserved namespace\n',
      );
      const reserved = await materializeExercise(source, path.join(outputParent, 'reserved'));
      expect(reserved.ok).toBe(false);
      if (!reserved.ok) expect(reserved.diagnostics[0]?.code).toBe('EXERCISE_PATH_001');
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(outputParent, { recursive: true, force: true });
    }
  });
});
