import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'publish-templates',
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The end-to-end dry run performs a frozen install and a full baseline
    // verification inside a generated repository, which is far slower than a
    // unit test. Ordered last so faster suites report first.
    sequence: {
      groupOrder: 3,
    },
  },
});
