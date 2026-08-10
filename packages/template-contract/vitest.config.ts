import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'template-contract',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
