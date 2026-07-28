import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'curriculum-schema',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
