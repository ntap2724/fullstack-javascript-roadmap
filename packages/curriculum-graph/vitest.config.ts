import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'curriculum-graph',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
