import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: false,
    projects: [
      'packages/*/vitest.config.ts',
      'tooling/*/vitest.config.ts',
      'apps/*/vitest.config.ts',
      'projects/milestones/*/vitest.config.ts',
      {
        test: {
          name: 'root-scripts',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
        },
      },
    ],
  },
});
