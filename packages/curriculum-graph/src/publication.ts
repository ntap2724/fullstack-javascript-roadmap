import type { Diagnostic } from '@roadmap/validation-core';
import type { CurriculumGraph } from './types.js';

const INVALID_TARGET_STATUSES = new Set(['draft', 'review']);

/**
 * Validates declaration ownership rather than normalized edge direction.
 * A declaration always belongs to its source document, including relations
 * such as lesson.module whose structural edge is normalized in reverse.
 */
export function publicationDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const reference of graph.declaredReferences) {
    const source = graph.nodes.get(reference.declaringId);
    const target = graph.nodes.get(reference.targetId);
    if (source === undefined || target === undefined) continue;

    if (source.data.status === 'published' && INVALID_TARGET_STATUSES.has(target.data.status)) {
      diagnostics.push({
        code: 'CURRICULUM_PUBLICATION_001',
        severity: 'error',
        location: { file: reference.sourceFile, pointer: reference.pointer },
        observed: {
          source: reference.declaringId,
          target: reference.targetId,
          targetStatus: target.data.status,
        },
        expected: 'Published content references only published, deprecated, or withdrawn content',
        reason: 'Production curriculum cannot depend on content excluded from production',
        remediation: 'Publish the dependency or remove the reference from the published item',
        documentation: 'docs/authoring/publication-states.md',
      });
    }
  }

  return diagnostics;
}
