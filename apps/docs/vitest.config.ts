import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'docs',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
