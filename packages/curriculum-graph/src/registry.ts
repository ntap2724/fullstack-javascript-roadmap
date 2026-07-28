import type { CurriculumDocument } from '@roadmap/curriculum-schema';
import {
  failure,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';

/**
 * Builds the stable-ID registry from documents in deterministic file order.
 * On a duplicate id, emits one CURRICULUM_ID_001 diagnostic naming both
 * declaring file paths and returns no graph.
 */
export function createRegistry(
  documents: readonly CurriculumDocument[],
): ValidationOutcome<ReadonlyMap<string, CurriculumDocument>> {
  const nodes = new Map<string, CurriculumDocument>();
  const diagnostics: Diagnostic[] = [];

  for (const document of documents) {
    const id = document.data.id;
    const existing = nodes.get(id);
    if (existing !== undefined) {
      diagnostics.push({
        code: 'CURRICULUM_ID_001',
        severity: 'error',
        location: { file: document.filePath, pointer: 'id' },
        observed: { id, declaredIn: [existing.filePath, document.filePath] },
        expected: 'Every curriculum entity id is declared by exactly one document',
        reason: `The id "${id}" is declared by both "${existing.filePath}" and "${document.filePath}"`,
        remediation: 'Rename one of the documents so each id is unique across the corpus',
        documentation: 'docs/authoring/curriculum-metadata.md',
      });
      continue;
    }
    nodes.set(id, document);
  }

  if (diagnostics.length > 0) {
    return failure(diagnostics);
  }

  return success(nodes);
}
