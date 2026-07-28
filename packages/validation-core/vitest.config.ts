import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'validation-core',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
