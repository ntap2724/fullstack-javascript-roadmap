import { realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  deriveAuthoritativeManifest,
  deriveWorkspaceManifest,
  compareManifestTriplet,
  manifestsMatchExactly,
  readBaselineManifest,
} from './baseline-manifest.js';
import { loadExercise, resolveExerciseRoot } from './load-exercise.js';
import { createProductionMaterializeFilesystemAdapter } from './materialization-filesystem.js';
import { materializeExercise, type ExerciseWorkspace } from './materialize.js';
import {
  assertSourceOutputAreDisjoint,
  assertSourceRootIsReal,
  WorkspacePathError,
} from './workspace-paths.js';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';

function workspaceDiagnostic(
  code: 'EXERCISE_WORKSPACE_001' | 'EXERCISE_WORKSPACE_002',
  reason: string,
  observed: unknown,
): Diagnostic {
  return {
    code,
    severity: 'error',
    location: { file: '.roadmap/exercise-baseline.json' },
    observed,
    expected: 'Valid exercise provenance and a protected workspace inventory',
    reason,
    remediation:
      'Restore the released baseline metadata and protected workspace files before reopening.',
    documentation: 'Reopen is non-destructive and never replaces an unknown workspace.',
  };
}

function pathDiagnostic(error: WorkspacePathError): Diagnostic {
  return {
    code: error.code,
    severity: 'error',
    location: { file: 'exercise source' },
    observed: error.code,
    expected: 'Disjoint canonical source and output roots',
    reason: 'Exercise path safety could not be established.',
    remediation: 'Choose an output path outside the exercise source tree.',
    documentation: 'Source/output aliases and containment are rejected before workspace reads.',
  };
}

function outputDiagnostic(reason: string, observed: unknown): Diagnostic {
  return {
    code: 'EXERCISE_OUTPUT_002',
    severity: 'error',
    location: { file: 'exercise output' },
    observed,
    expected: 'A missing output or a workspace with valid baseline provenance',
    reason,
    remediation: 'Choose a fresh output directory or restore its released baseline metadata.',
    documentation: 'Unknown existing output is never replaced or deleted.',
  };
}

export async function openExerciseWorkspace(
  sourceRootInput: string | URL,
  outputRootInput: string,
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
    return failure([
      workspaceDiagnostic(
        'EXERCISE_WORKSPACE_002',
        'Workspace source could not be resolved.',
        'unresolved-source',
      ),
    ]);
  }

  const adapter = createProductionMaterializeFilesystemAdapter();
  let state;
  try {
    state = await adapter.inspectOutputState(outputRoot);
  } catch {
    return failure([
      workspaceDiagnostic(
        'EXERCISE_WORKSPACE_002',
        'Workspace output could not be inspected.',
        'unreadable-output',
      ),
    ]);
  }
  if (state === 'missing') return materializeExercise(sourceRoot, outputRoot);

  const baselineManifestPath = path.join(outputRoot, '.roadmap', 'exercise-baseline.json');
  let cached;
  try {
    cached = await readBaselineManifest(baselineManifestPath);
  } catch {
    if (state === 'existing-empty' || state === 'non-empty-unknown') {
      return failure([
        outputDiagnostic('Existing output has no valid released baseline provenance.', state),
      ]);
    }
    return failure([
      workspaceDiagnostic(
        'EXERCISE_WORKSPACE_002',
        'Workspace baseline metadata is malformed or missing.',
        'invalid-baseline',
      ),
    ]);
  }
  let authoritative;
  let current;
  try {
    authoritative = await deriveAuthoritativeManifest(sourceRoot, loaded.value);
    current = await deriveWorkspaceManifest(outputRoot);
  } catch {
    return failure([
      workspaceDiagnostic(
        'EXERCISE_WORKSPACE_002',
        'Workspace inventory could not be trusted.',
        'invalid-inventory',
      ),
    ]);
  }
  if (!manifestsMatchExactly(authoritative, cached)) {
    return failure([
      workspaceDiagnostic(
        'EXERCISE_WORKSPACE_001',
        'Workspace baseline provenance is stale.',
        'stale-provenance',
      ),
    ]);
  }
  const comparison = compareManifestTriplet(
    authoritative,
    cached,
    current,
    loaded.value.constraints.editablePaths,
  );
  if (!comparison.ok) return failure(comparison.diagnostics);
  return success({
    exerciseId: loaded.value.id,
    sourceRoot,
    root: outputRoot,
    baselineManifestPath,
  });
}
