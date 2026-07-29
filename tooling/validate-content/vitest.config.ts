import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'validate-content',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
