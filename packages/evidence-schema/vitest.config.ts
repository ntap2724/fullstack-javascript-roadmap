import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'evidence-schema',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
