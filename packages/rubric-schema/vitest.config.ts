import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'rubric-schema',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
