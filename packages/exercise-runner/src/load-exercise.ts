import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExerciseDefinitionSchema, type ExerciseDefinition } from '@roadmap/exercise-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { parse } from 'yaml';

function schemaDiagnostic(issue: {
  readonly path: readonly PropertyKey[];
  readonly message: string;
  readonly code: string;
}) {
  const pointer = issue.path.length === 0 ? '/' : `/${issue.path.map(String).join('/')}`;
  return {
    code: 'EXERCISE_SCHEMA_001',
    severity: 'error' as const,
    location: { file: 'exercise.yaml', pointer },
    observed: issue.code,
    expected: 'A strict ExerciseDefinition document',
    reason: issue.message,
    remediation: 'Correct exercise.yaml to match the released exercise contract.',
    documentation: 'The exercise contract is validated before any workspace filesystem operation.',
  };
}

function loadDiagnostic() {
  return {
    code: 'EXERCISE_LOAD_001',
    severity: 'error' as const,
    location: { file: 'exercise.yaml' },
    observed: 'unreadable-or-invalid-yaml',
    expected: 'Readable UTF-8 YAML containing one ExerciseDefinition document',
    reason: 'Exercise metadata could not be loaded safely.',
    remediation: 'Provide a readable, valid exercise.yaml file.',
    documentation: 'Loader failures do not expose raw parser stacks or absolute filesystem paths.',
  };
}

export function resolveExerciseRoot(sourceRoot: string | URL): string {
  return sourceRoot instanceof URL ? fileURLToPath(sourceRoot) : path.resolve(sourceRoot);
}

export async function loadExercise(
  sourceRoot: string | URL,
): Promise<ValidationOutcome<ExerciseDefinition>> {
  let root: string;
  try {
    root = resolveExerciseRoot(sourceRoot);
    const metadata = await readFile(path.join(root, 'exercise.yaml'), 'utf8');
    const parsed: unknown = parse(metadata);
    const checked = ExerciseDefinitionSchema.safeParse(parsed);
    if (!checked.success) {
      return failure(checked.error.issues.map((issue) => schemaDiagnostic(issue)));
    }
    return success(checked.data);
  } catch {
    return failure([loadDiagnostic()]);
  }
}
