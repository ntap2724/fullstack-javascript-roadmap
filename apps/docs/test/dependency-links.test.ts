import { describe, expect, it } from 'vitest';
import { resolveDependencyLinks, type DependencyEntry } from '../src/lib/dependency-links.js';

const entries = [
  {
    id: 'lessons/javascript/functions/closure-private-state',
    data: {
      semanticId: 'lesson-js-closure-private-state',
      title: 'Closure và private state',
    },
  },
  {
    id: 'lessons/javascript/functions/function-values',
    data: {
      semanticId: 'lesson-js-function-values',
      title: 'Function như một giá trị',
    },
  },
] satisfies readonly DependencyEntry[];

describe('curriculum dependency links', () => {
  it('resolves semantic prerequisites through loaded entry metadata', () => {
    expect(resolveDependencyLinks(entries, ['lesson-js-function-values'])).toEqual([
      {
        semanticId: 'lesson-js-function-values',
        href: '/lessons/javascript/functions/function-values/',
        label: 'Function như một giá trị',
      },
    ]);
  });

  it('fails closed when a semantic prerequisite has no loaded entry', () => {
    expect(() => resolveDependencyLinks(entries, ['missing-id'])).toThrow(
      /Unresolved curriculum dependency: missing-id/,
    );
  });
});
