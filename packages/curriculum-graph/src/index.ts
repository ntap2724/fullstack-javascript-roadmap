import type { CurriculumCorpus } from '@roadmap/curriculum-schema';
import { failure, hasErrors, success, type ValidationOutcome } from '@roadmap/validation-core';
import { normalizeEdges } from './edges.js';
import { enumerateDeclaredReferences, resolveReferences } from './references.js';
import { createRegistry } from './registry.js';
import type { CurriculumGraph } from './types.js';

export * from './types.js';
export * from './registry.js';
export * from './references.js';
export * from './edges.js';

/**
 * Builds a CurriculumGraph from a loaded corpus: registers stable ids,
 * enumerates every declared reference, validates required local
 * references, and normalizes deduplicated structural edges.
 */
export function buildCurriculumGraph(corpus: CurriculumCorpus): ValidationOutcome<CurriculumGraph> {
  const registryOutcome = createRegistry(corpus.documents);
  if (!registryOutcome.ok) {
    return failure(registryOutcome.diagnostics);
  }

  const nodes = registryOutcome.value;
  const declaredReferences = enumerateDeclaredReferences(corpus.documents);
  const referenceDiagnostics = resolveReferences(nodes, declaredReferences);

  if (hasErrors(referenceDiagnostics)) {
    return failure(referenceDiagnostics);
  }

  const edges = normalizeEdges(declaredReferences);

  return success({ nodes, declaredReferences, edges });
}
