import { describe, expect, it } from 'vitest';
import {
  cycleDiagnostics,
  findPrerequisiteCycles,
  validatePrerequisiteCycles,
} from '../src/cycles.js';
import type { CurriculumGraph } from '../src/types.js';
import { graphFixture } from './support/graph-fixture.js';

function graph(edges: Array<[string, string]>): CurriculumGraph {
  const ids = new Set(edges.flat());
  return {
    nodes: new Map(
      [...ids].map((id) => [id, { filePath: `${id}.md`, body: '', data: { id } } as never]),
    ),
    declaredReferences: [],
    edges: edges.map(([from, to]) => ({
      from,
      to,
      type: 'prerequisite',
      sourceFile: `${from}.md`,
    })),
  };
}

describe('findPrerequisiteCycles', () => {
  it('returns a self-cycle as a closed path', () => {
    expect(findPrerequisiteCycles(graph([['a', 'a']]))).toEqual([['a', 'a']]);
  });

  it('returns a two-node cycle as a closed path', () => {
    expect(
      findPrerequisiteCycles(
        graph([
          ['a', 'b'],
          ['b', 'a'],
        ]),
      ),
    ).toEqual([['a', 'b', 'a']]);
  });

  it('returns a complete multi-node path', () => {
    expect(
      findPrerequisiteCycles(
        graph([
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'a'],
        ]),
      ),
    ).toEqual([['a', 'b', 'c', 'a']]);
  });

  it('rotation-normalizes and deduplicates a cycle reached from another node', () => {
    expect(
      findPrerequisiteCycles(
        graph([
          ['0', 'b'],
          ['b', 'c'],
          ['c', 'a'],
          ['c', 'a'],
          ['a', 'b'],
        ]),
      ),
    ).toEqual([['a', 'b', 'c', 'a']]);
  });

  it('returns no cycles for an acyclic graph', () => {
    expect(
      findPrerequisiteCycles(
        graph([
          ['a', 'b'],
          ['b', 'c'],
        ]),
      ),
    ).toEqual([]);
  });

  it('returns exact sorted output for two disjoint cycles', () => {
    expect(
      findPrerequisiteCycles(
        graph([
          ['x', 'y'],
          ['y', 'x'],
          ['a', 'b'],
          ['b', 'a'],
        ]),
      ),
    ).toEqual([
      ['a', 'b', 'a'],
      ['x', 'y', 'x'],
    ]);
  });
});

describe('cycle diagnostics and validation outcome', () => {
  it('converts a cycle into CURRICULUM_GRAPH_003 with the closed path', () => {
    expect(cycleDiagnostics(graph([['a', 'a']]))).toEqual([
      expect.objectContaining({ code: 'CURRICULUM_GRAPH_003', observed: ['a', 'a'] }),
    ]);
  });

  it('returns success with the original acyclic graph', () => {
    const input = graph([['a', 'b']]);
    const outcome = validatePrerequisiteCycles(input);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value).toBe(input);
  });

  it('returns failure for a cyclic graph', () => {
    const outcome = validatePrerequisiteCycles(graph([['a', 'a']]));
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ code: 'CURRICULUM_GRAPH_003', observed: ['a', 'a'] }),
    ]);
  });

  it('converts unexpected traversal exceptions to VALIDATOR_INTERNAL_001', () => {
    const throwingGraph = {
      nodes: new Map(),
      declaredReferences: [],
      get edges(): CurriculumGraph['edges'] {
        throw new Error('unexpected edge access');
      },
    } as CurriculumGraph;
    const outcome = validatePrerequisiteCycles(throwingGraph);
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics).toEqual([
      expect.objectContaining({ code: 'VALIDATOR_INTERNAL_001' }),
    ]);
  });
});

describe('cycle fixtures', () => {
  it.each([
    ['invalid/self-cycle', ['track-cycle-a', 'track-cycle-a']],
    ['invalid/two-node-cycle', ['track-cycle-a', 'track-cycle-b', 'track-cycle-a']],
    [
      'invalid/multi-node-cycle',
      ['track-cycle-a', 'track-cycle-b', 'track-cycle-c', 'track-cycle-a'],
    ],
  ] as const)('reports the exact canonical cycle for %s', async (fixture, expected) => {
    const graphOutcome = await graphFixture(fixture);
    expect(graphOutcome.ok).toBe(true);
    if (!graphOutcome.ok) return;
    expect(cycleDiagnostics(graphOutcome.value)).toEqual([
      expect.objectContaining({ code: 'CURRICULUM_GRAPH_003', observed: expected }),
    ]);
  });
});
