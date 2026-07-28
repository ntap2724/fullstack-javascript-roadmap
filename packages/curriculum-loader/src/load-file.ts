import { readFile } from 'node:fs/promises';
import { CurriculumEntitySchema, type CurriculumDocument } from '@roadmap/curriculum-schema';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { parseFrontmatter } from './frontmatter.js';

export async function loadCurriculumFile(
  filePath: string,
): Promise<ValidationOutcome<CurriculumDocument>> {
  try {
    const source = await readFile(filePath, 'utf8');
    const parsed = parseFrontmatter(source);
    const result = CurriculumEntitySchema.safeParse(parsed.data);
    if (!result.success) {
      const diagnostics: Diagnostic[] = result.error.issues.map((issue) => ({
        code: 'CURRICULUM_SCHEMA_001',
        severity: 'error',
        location: { file: filePath, pointer: issue.path.join('.') },
        observed: issue.input,
        expected: issue.message,
        reason: 'Curriculum frontmatter does not satisfy the canonical schema',
        remediation: 'Correct the named field and rerun content validation',
        documentation: 'docs/authoring/curriculum-metadata.md',
      }));
      return failure(diagnostics);
    }
    return success({ filePath, body: parsed.body, data: result.data });
  } catch (error) {
    return failure([
      {
        code: 'CURRICULUM_PARSE_001',
        severity: 'error',
        location: { file: filePath },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'UTF-8 Markdown with YAML frontmatter',
        reason: 'The curriculum source could not be parsed',
        remediation: 'Repair the Markdown or frontmatter delimiters and rerun validation',
        documentation: 'docs/authoring/curriculum-metadata.md',
      },
    ]);
  }
}
