import {
  failure,
  hasErrors,
  internalErrorDiagnostic,
  mergeDiagnostics,
  success,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { completenessDiagnostics } from './completeness.js';
import { cycleDiagnostics } from './cycles.js';
import { publicationDiagnostics } from './publication.js';
import type { CurriculumGraph } from './types.js';

/**
 * Composes each graph diagnostic collector exactly once and converts any
 * unexpected exception into a fail-closed validation outcome.
 */
export function validateCurriculumGraph(
  graph: CurriculumGraph,
): ValidationOutcome<CurriculumGraph> {
  try {
    const diagnostics = mergeDiagnostics(
      cycleDiagnostics(graph),
      publicationDiagnostics(graph),
      completenessDiagnostics(graph),
    );
    return hasErrors(diagnostics) ? failure(diagnostics) : success(graph, diagnostics);
  } catch (error) {
    return failure([internalErrorDiagnostic(error, '<curriculum-graph>')]);
  }
}
