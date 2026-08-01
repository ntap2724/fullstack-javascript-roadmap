import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'exercise-contract',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
