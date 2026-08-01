import { realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ExerciseDefinition } from '@roadmap/exercise-contract';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import {
  deriveAuthoritativeManifest,
  validateAuthoritativeManifest,
  writeBaselineManifest,
  type ExerciseBaselineManifest,
} from './baseline-manifest.js';
import { loadExercise, resolveExerciseRoot } from './load-exercise.js';
import {
  ExerciseOutputError,
  createProductionMaterializeFilesystemAdapter,
  type MaterializeFilesystemAdapter,
  type OwnedReservation,
  type OwnedStage,
} from './materialization-filesystem.js';
import {
  assertSourceOutputAreDisjoint,
  assertSourceRootIsReal,
  WorkspacePathError,
} from './workspace-paths.js';

export interface ExerciseWorkspace {
  readonly exerciseId: string;
  readonly sourceRoot: string;
  readonly root: string;
  readonly baselineManifestPath: string;
}

function diagnostic(code: string, reason: string, observed: unknown): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: code.startsWith('EXERCISE_PATH') ? 'exercise source' : 'exercise output' },
    observed,
    expected: 'A safe, exclusively owned exercise workspace',
    reason,
    remediation: 'Correct the exercise source or choose a fresh output directory.',
    documentation:
      'Materialization is fail-closed and preserves content it cannot prove ownership of.',
  };
}

function outputDiagnostic(error: ExerciseOutputError): Diagnostic {
  return diagnostic(
    error.diagnosticCode,
    'Exercise output materialization did not complete safely.',
    error.diagnosticCode,
  );
}

function pathDiagnostic(error: WorkspacePathError): Diagnostic {
  return diagnostic(
    error.code,
    'Exercise source and output path safety could not be established.',
    error.code,
  );
}

function pathFailure(message: string): Diagnostic {
  return diagnostic('EXERCISE_PATH_001', message, 'untrusted-source-path');
}

function workspaceFrom(
  definition: ExerciseDefinition,
  sourceRoot: string,
  outputRoot: string,
  baselineManifestPath: string,
): ExerciseWorkspace {
  return { exerciseId: definition.id, sourceRoot, root: outputRoot, baselineManifestPath };
}

async function materializeExerciseCore(
  sourceRootInput: string | URL,
  outputRootInput: string,
  adapter: MaterializeFilesystemAdapter,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  const loaded = await loadExercise(sourceRootInput);
  if (!loaded.ok) return loaded;

  let sourceRoot: string;
  let outputRoot: string;
  try {
    const lexicalSourceRoot = path.resolve(resolveExerciseRoot(sourceRootInput));
    await assertSourceRootIsReal(lexicalSourceRoot);
    outputRoot = path.resolve(outputRootInput);
    await assertSourceOutputAreDisjoint(lexicalSourceRoot, outputRoot);
    sourceRoot = await realpath(lexicalSourceRoot);
  } catch (error) {
    if (error instanceof WorkspacePathError) return failure([pathDiagnostic(error)]);
    return failure([pathFailure('Exercise source could not be resolved safely.')]);
  }

  let stage: OwnedStage | undefined;
  let reservation: OwnedReservation | undefined;
  try {
    const state = await adapter.inspectOutputState(outputRoot);
    if (state !== 'missing') {
      throw new ExerciseOutputError('EXERCISE_OUTPUT_002', 'Exercise output already exists');
    }
    stage = await adapter.createOwnedStage(
      path.dirname(outputRoot),
      '.roadmap-stage-',
      path.join(sourceRoot, 'starter'),
      path.join(sourceRoot, 'tests', 'open'),
    );
    const authoritative: ExerciseBaselineManifest = await deriveAuthoritativeManifest(
      sourceRoot,
      loaded.value,
    );
    const baselineManifestPath = path.join(stage.root, '.roadmap', 'exercise-baseline.json');
    await writeBaselineManifest(baselineManifestPath, authoritative);
    await validateAuthoritativeManifest(stage.root, sourceRoot, loaded.value, {
      excludedStagePaths: [...stage.controlPaths, '.roadmap/exercise-baseline.json'],
    });
    const expectedInventory = [
      ...authoritative.files.map((record) => record.path),
      '.roadmap/exercise-baseline.json',
    ];
    reservation = await adapter.reserveMissingDirectory(outputRoot, expectedInventory);
    await adapter.populateReservedDirectory(stage, reservation, {
      noOverwrite: true,
      sourceControlPaths: stage.controlPaths,
      targetControlPaths: reservation.controlPaths,
    });
    await adapter.validateOwnedInventory(reservation);
    await adapter.removeOwnedStage(stage, expectedInventory, { controlPaths: stage.controlPaths });
    stage = undefined;
    await adapter.finalizeOwnedReservation(reservation, {
      expectedInventory,
      controlPaths: reservation.controlPaths,
    });
    reservation = undefined;
    return success(
      workspaceFrom(
        loaded.value,
        sourceRoot,
        outputRoot,
        path.join(outputRoot, '.roadmap', 'exercise-baseline.json'),
      ),
    );
  } catch (error) {
    let cleanupError: unknown;
    if (stage !== undefined || reservation !== undefined) {
      try {
        await adapter.cleanupOwnedMaterialization(stage, reservation, {
          requireOwnershipToken: true,
          refuseUnexpectedContent: true,
          allowPartialOwnedInventory: true,
        });
      } catch (cleanupFailure) {
        cleanupError = cleanupFailure;
      }
    }
    if (cleanupError instanceof ExerciseOutputError)
      return failure([outputDiagnostic(cleanupError)]);
    if (error instanceof ExerciseOutputError) return failure([outputDiagnostic(error)]);
    if (error instanceof WorkspacePathError) return failure([pathDiagnostic(error)]);
    return failure([
      pathFailure('Authoritative exercise content could not be materialized safely.'),
    ]);
  }
}

export async function materializeExercise(
  sourceRoot: string | URL,
  outputRoot: string,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  return materializeExerciseCore(
    sourceRoot,
    outputRoot,
    createProductionMaterializeFilesystemAdapter(),
  );
}

/** @internal Package-local lifecycle seam; deliberately absent from the public package index. */
export async function materializeExerciseWithFilesystemForTest(
  sourceRoot: string | URL,
  outputRoot: string,
  adapter: MaterializeFilesystemAdapter,
): Promise<ValidationOutcome<ExerciseWorkspace>> {
  return materializeExerciseCore(sourceRoot, outputRoot, adapter);
}
