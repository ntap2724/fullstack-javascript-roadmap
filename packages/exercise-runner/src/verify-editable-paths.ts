import {
  matchesEditablePath,
  normalizeRelativePath,
  isSafeRelativePath,
  type ExerciseDefinition,
} from '@roadmap/exercise-contract';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import {
  compareManifestTriplet,
  deriveAuthoritativeManifest,
  deriveWorkspaceManifest,
  readBaselineManifest,
  type BaselineFileRecord,
  type ExerciseBaselineManifest,
  type WorkspaceFileManifest,
} from './baseline-manifest.js';
import type { ExerciseWorkspace } from './materialize.js';

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function protectedPathDiagnostic(candidate: string): Diagnostic {
  return {
    code: 'EXERCISE_EDITABLE_001',
    severity: 'error',
    location: { file: candidate },
    observed: candidate,
    expected: 'Only paths matching the exercise editable-path constraints may change.',
    reason: 'A protected exercise path changed or an unexpected protected path appeared.',
    remediation:
      'Restore the protected path and make learner edits only within the editable paths.',
    documentation: 'Protected workspace verification runs before any exercise command.',
  };
}

function boundaryDiagnostic(): Diagnostic {
  return {
    code: 'EXERCISE_EDITABLE_002',
    severity: 'error',
    location: { file: '.roadmap/exercise-baseline.json' },
    observed: 'untrusted-workspace-boundary',
    expected: 'A readable workspace with a trusted source and baseline inventory.',
    reason: 'Workspace contents or provenance could not be established safely.',
    remediation:
      'Restore the released workspace metadata and protected content before verification.',
    documentation:
      'Filesystem uncertainty is rejected without mutation, repair, or command execution.',
  };
}

function recordPaths(
  manifest: ExerciseBaselineManifest | WorkspaceFileManifest,
): readonly string[] {
  return manifest.files.map((record: BaselineFileRecord) => record.path);
}

function exactConcretePathUnion(
  authoritative: ExerciseBaselineManifest,
  current: WorkspaceFileManifest,
): readonly string[] {
  const values = [...recordPaths(authoritative), ...recordPaths(current)];
  const unique = new Set<string>();
  for (const value of values) {
    if (!isSafeRelativePath(value) || normalizeRelativePath(value) !== value) {
      throw new Error('Unsafe comparison path');
    }
    unique.add(value);
  }
  return [...unique].sort(compareCodeUnits);
}

export async function verifyEditablePaths(
  workspace: ExerciseWorkspace,
  definition: ExerciseDefinition,
  editablePaths: readonly string[],
): Promise<ValidationOutcome<readonly string[]>> {
  try {
    const authoritative = await deriveAuthoritativeManifest(workspace.sourceRoot, definition);
    const cached = await readBaselineManifest(workspace.baselineManifestPath);
    const current = await deriveWorkspaceManifest(workspace.root);
    const comparisonAllowlist = exactConcretePathUnion(authoritative, current);
    const comparison = compareManifestTriplet(authoritative, cached, current, comparisonAllowlist);
    if (!comparison.ok) return failure(comparison.diagnostics);

    const changed = [...comparison.changed].sort(compareCodeUnits);
    const protectedPaths = changed.filter(
      (candidate) => !matchesEditablePath(candidate, editablePaths),
    );
    if (protectedPaths.length > 0) {
      return failure(protectedPaths.map((candidate) => protectedPathDiagnostic(candidate)));
    }
    return success(changed);
  } catch {
    return failure([boundaryDiagnostic()]);
  }
}
