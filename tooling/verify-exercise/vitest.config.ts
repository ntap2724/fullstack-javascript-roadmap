import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'verify-exercise',
    environment: 'node',
    testTimeout: 20000,
    include: ['test/**/*.test.ts'],
    sequence: {
      groupOrder: 3,
    },
  },
});
