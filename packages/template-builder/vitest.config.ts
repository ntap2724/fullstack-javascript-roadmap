import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-builder',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
