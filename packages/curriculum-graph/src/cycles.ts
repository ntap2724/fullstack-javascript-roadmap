import {
  failure,
  hasErrors,
  internalErrorDiagnostic,
  success,
  type Diagnostic,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import type { CurriculumGraph } from './types.js';

function compareCodepoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pathKey(path: readonly string[]): string {
  return path.join('\0');
}

/**
 * Rotates a cycle's ring (the path with the closing node dropped) to its
 * codepoint-minimal rotation, then re-closes it. This makes a cycle
 * discovered from any starting node compare equal to the same cycle
 * discovered from another node in the same strongly connected component.
 */
function canonicalizeCycle(cycle: readonly string[]): readonly string[] {
  const ring = cycle.slice(0, -1);
  const first = ring[0];
  if (first === undefined) return cycle;

  let canonical = [...ring];
  for (let index = 1; index < ring.length; index += 1) {
    const candidate = [...ring.slice(index), ...ring.slice(0, index)];
    if (compareCodepoints(pathKey(candidate), pathKey(canonical)) < 0) {
      canonical = candidate;
    }
  }

  const canonicalStart = canonical[0];
  return canonicalStart === undefined ? cycle : [...canonical, canonicalStart];
}

/**
 * Discovers prerequisite cycles with a single depth-first traversal. Every
 * closed back-edge witness is canonicalized (rotation-normalized) and
 * deduplicated by its canonical path, then the result is sorted by
 * codepoint order for a deterministic return value. This does not
 * enumerate every simple cycle in a strongly connected component; it
 * reports one canonical witness path per distinct cycle found via the
 * deterministic traversal order.
 */
export function findPrerequisiteCycles(graph: CurriculumGraph): readonly (readonly string[])[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.type !== 'prerequisite') continue;
    const targets = adjacency.get(edge.from) ?? [];
    targets.push(edge.to);
    adjacency.set(edge.from, targets);
  }
  for (const targets of adjacency.values()) targets.sort(compareCodepoints);

  const visited = new Set<string>();
  const active = new Map<string, number>();
  const stack: string[] = [];
  const cycles = new Map<string, readonly string[]>();

  const visit = (node: string): void => {
    const activeIndex = active.get(node);
    if (activeIndex !== undefined) {
      const canonical = canonicalizeCycle([...stack.slice(activeIndex), node]);
      cycles.set(pathKey(canonical), canonical);
      return;
    }
    if (visited.has(node)) return;

    active.set(node, stack.length);
    stack.push(node);
    for (const target of adjacency.get(node) ?? []) visit(target);
    stack.pop();
    active.delete(node);
    visited.add(node);
  };

  for (const node of [...graph.nodes.keys()].sort(compareCodepoints)) visit(node);
  return [...cycles.values()].sort((left, right) =>
    compareCodepoints(pathKey(left), pathKey(right)),
  );
}

/**
 * Converts each discovered cycle into a CURRICULUM_GRAPH_003 diagnostic.
 * Reuses findPrerequisiteCycles as the only traversal; Task 7 composes
 * this collector directly with publication and completeness diagnostics.
 */
export function cycleDiagnostics(graph: CurriculumGraph): readonly Diagnostic[] {
  return findPrerequisiteCycles(graph).map((cycle) => {
    const start = cycle[0];
    return {
      code: 'CURRICULUM_GRAPH_003',
      severity: 'error',
      location: {
        file:
          start === undefined
            ? '<curriculum>'
            : (graph.nodes.get(start)?.filePath ?? '<curriculum>'),
      },
      observed: cycle,
      expected: 'An acyclic prerequisite graph',
      reason: `Prerequisite cycle detected: ${cycle.join(' -> ')}`,
      remediation: 'Remove or redirect at least one prerequisite edge in the reported cycle',
      documentation: 'docs/architecture/curriculum-graph.md#cycles',
    };
  });
}

/**
 * Fail-closed ValidationOutcome wrapper around cycleDiagnostics. Performs
 * no second traversal: on success it returns the original graph unchanged;
 * on any reported cycle it fails; any unexpected exception during
 * diagnostic conversion is converted to VALIDATOR_INTERNAL_001 so this
 * wrapper never throws.
 */
export function validatePrerequisiteCycles(
  graph: CurriculumGraph,
): ValidationOutcome<CurriculumGraph> {
  try {
    const diagnostics = cycleDiagnostics(graph);
    return hasErrors(diagnostics) ? failure(diagnostics) : success(graph, diagnostics);
  } catch (error) {
    return failure([internalErrorDiagnostic(error, '<curriculum-graph>')]);
  }
}
