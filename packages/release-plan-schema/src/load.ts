import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { ReleasePlanSchema, type ReleasePlan } from './schema.js';

export async function loadReleasePlan(filePath: string): Promise<ValidationOutcome<ReleasePlan>> {
  try {
    const parsed: unknown = YAML.parse(await readFile(filePath, 'utf8'));
    const result = ReleasePlanSchema.safeParse(parsed);
    if (result.success) return success(result.data);

    const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
      code: 'RELEASE_PLAN_SCHEMA_001',
      severity: 'error',
      location: { file: filePath, pointer: issue.path.join('.') },
      observed: issue.input,
      expected: issue.message,
      reason: 'Release plan metadata does not satisfy the canonical contract',
      remediation: 'Correct the named backlog field and rerun release-plan validation',
      documentation: 'planning/release-1/dependency-graph.md',
    }));
    return failure(diagnostics);
  } catch (error) {
    return failure([
      {
        code: 'RELEASE_PLAN_PARSE_001',
        severity: 'error',
        location: { file: filePath },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'UTF-8 YAML satisfying ReleasePlanSchema',
        reason: 'The Release 1 backlog could not be parsed',
        remediation: 'Repair the YAML syntax and rerun release-plan validation',
        documentation: 'planning/release-1/dependency-graph.md',
      },
    ]);
  }
}
