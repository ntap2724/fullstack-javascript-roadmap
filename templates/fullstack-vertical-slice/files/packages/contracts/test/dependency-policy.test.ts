import { describe, expect, it } from 'vitest';
import { evaluateStarterDependencyPolicy } from './dependency-policy.js';

const validFutureWebPackage = {
  manifest: {
    name: '@workshop/web',
    dependencies: {
      '@workshop/contracts': 'workspace:*',
    },
  },
  sourceFiles: {
    'src/workshops.ts': "import { WorkshopListResponseSchema } from '@workshop/contracts';",
  },
};

describe('starter dependency policy', () => {
  it('allows a future web package to consume public contracts', () => {
    expect(evaluateStarterDependencyPolicy(validFutureWebPackage)).toEqual([]);
  });

  it('rejects a future web package dependency on the database package', () => {
    const diagnostics = evaluateStarterDependencyPolicy({
      ...validFutureWebPackage,
      manifest: {
        ...validFutureWebPackage.manifest,
        dependencies: {
          ...validFutureWebPackage.manifest.dependencies,
          '@workshop/database': 'workspace:*',
        },
      },
    });

    expect(diagnostics).toEqual([
      {
        code: 'STARTER_DEPENDENCY_001',
        message:
          '@workshop/web must not declare @workshop/database in dependencies; web may consume @workshop/contracts only.',
        packageName: '@workshop/web',
      },
    ]);
  });

  it('rejects a future web source import from the database package', () => {
    const diagnostics = evaluateStarterDependencyPolicy({
      ...validFutureWebPackage,
      sourceFiles: {
        'src/workshops.ts': "import { workshops } from '@workshop/database';",
      },
    });

    expect(diagnostics).toEqual([
      {
        code: 'STARTER_IMPORT_001',
        message:
          'src/workshops.ts must not import @workshop/database; web source may import @workshop/contracts only.',
        packageName: '@workshop/web',
        sourceFile: 'src/workshops.ts',
      },
    ]);
  });
});
