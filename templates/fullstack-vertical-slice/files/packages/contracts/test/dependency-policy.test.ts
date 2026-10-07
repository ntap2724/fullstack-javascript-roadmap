import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  evaluateStarterDependencyPolicy,
  type StarterPackagePolicyInput,
} from './dependency-policy.js';

const webManifestSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

const webPackageRoot = fileURLToPath(new URL('../../../apps/web/', import.meta.url));
const sourceModuleExtension = /\.[cm]?[jt]sx?$/;

async function readSourceModules(
  packageRoot: string,
  relativeDirectory = 'src',
): Promise<Record<string, string>> {
  const entries = await readdir(path.join(packageRoot, relativeDirectory), {
    withFileTypes: true,
  });
  const sourceFiles: Record<string, string> = {};

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);

    if (entry.isDirectory()) {
      Object.assign(sourceFiles, await readSourceModules(packageRoot, relativePath));
    } else if (entry.isFile() && sourceModuleExtension.test(entry.name)) {
      sourceFiles[relativePath] = await readFile(path.join(packageRoot, relativePath), 'utf8');
    }
  }

  return sourceFiles;
}

async function loadActualWebPackage(): Promise<StarterPackagePolicyInput> {
  const manifestSource = await readFile(path.join(webPackageRoot, 'package.json'), 'utf8');
  const parsedManifest: unknown = JSON.parse(manifestSource);

  return {
    manifest: webManifestSchema.parse(parsedManifest),
    sourceFiles: await readSourceModules(webPackageRoot),
  };
}

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

  it('rejects a literal dynamic import inside exported web code', () => {
    const diagnostics = evaluateStarterDependencyPolicy({
      ...validFutureWebPackage,
      sourceFiles: {
        'src/lazy.ts':
          "export async function loadDatabase() { return import('@workshop/database'); }",
      },
    });

    expect(diagnostics).toEqual([
      {
        code: 'STARTER_IMPORT_001',
        message:
          'src/lazy.ts must not import @workshop/database; web source may import @workshop/contracts only.',
        packageName: '@workshop/web',
        sourceFile: 'src/lazy.ts',
      },
    ]);
  });

  it.each([
    [
      'an import-shaped regular expression',
      "export const pattern = /import\\('@workshop\\/database'\\)/;",
    ],
    [
      'import-shaped JSX text',
      "export function View() { return <p>import('@workshop/database')</p>; }",
    ],
  ])('allows %s', (_description, source) => {
    expect(
      evaluateStarterDependencyPolicy({
        ...validFutureWebPackage,
        sourceFiles: { 'src/View.tsx': source },
      }),
    ).toEqual([]);
  });

  it.each([
    ['a type-only import', "import type { users } from '@workshop/database';"],
    ['an export-from declaration', "export { users } from '@workshop/database';"],
    ['a TypeScript import assignment', "import Database = require('@workshop/database');"],
    [
      'a type-only TypeScript import assignment',
      "import type Database = require('@workshop/database');",
    ],
  ])('rejects %s', (_description, source) => {
    expect(
      evaluateStarterDependencyPolicy({
        ...validFutureWebPackage,
        sourceFiles: { 'src/database.ts': source },
      }),
    ).toEqual([
      {
        code: 'STARTER_IMPORT_001',
        message:
          'src/database.ts must not import @workshop/database; web source may import @workshop/contracts only.',
        packageName: '@workshop/web',
        sourceFile: 'src/database.ts',
      },
    ]);
  });
});

describe('actual web package dependency policy', () => {
  it('accepts the actual web manifest and source tree', async () => {
    const actualWebPackage = await loadActualWebPackage();

    expect(actualWebPackage.sourceFiles).toHaveProperty('src/app/App.tsx');
    expect(actualWebPackage.sourceFiles).toHaveProperty('src/api/workshops.ts');
    expect(evaluateStarterDependencyPolicy(actualWebPackage)).toEqual([]);
  });

  it('rejects a forbidden dependency added to the actual web manifest input', async () => {
    const actualWebPackage = await loadActualWebPackage();
    const diagnostics = evaluateStarterDependencyPolicy({
      ...actualWebPackage,
      manifest: {
        ...actualWebPackage.manifest,
        dependencies: {
          ...actualWebPackage.manifest.dependencies,
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

  it('rejects a forbidden import added to the actual web source input', async () => {
    const actualWebPackage = await loadActualWebPackage();
    const diagnostics = evaluateStarterDependencyPolicy({
      ...actualWebPackage,
      sourceFiles: {
        ...actualWebPackage.sourceFiles,
        'src/__dependency-policy-mutation__.ts': "import { users } from '@workshop/database';",
      },
    });

    expect(diagnostics).toEqual([
      {
        code: 'STARTER_IMPORT_001',
        message:
          'src/__dependency-policy-mutation__.ts must not import @workshop/database; web source may import @workshop/contracts only.',
        packageName: '@workshop/web',
        sourceFile: 'src/__dependency-policy-mutation__.ts',
      },
    ]);
  });
});
