import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'release-plan-schema',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
