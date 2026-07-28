import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'curriculum-loader',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
