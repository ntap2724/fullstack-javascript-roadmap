import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-verifier',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
