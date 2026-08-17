import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    projects: ['packages/*/vitest.config.ts'],
  },
});
