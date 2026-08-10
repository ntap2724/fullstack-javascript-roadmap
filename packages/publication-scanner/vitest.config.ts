import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'publication-scanner',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
