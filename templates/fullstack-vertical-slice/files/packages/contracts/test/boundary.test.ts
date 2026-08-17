import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// boundary.test.ts is at packages/contracts/test/boundary.test.ts
// Go up 4 levels: test -> contracts -> packages -> files
const filesRoot = path.join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const packagesDir = path.join(filesRoot, 'packages');

const PackageManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional().default({}),
  devDependencies: z.record(z.string(), z.string()).optional().default({}),
});

async function packageDependencies(packageName: 'contracts' | 'database'): Promise<Set<string>> {
  const source = await readFile(path.join(packagesDir, packageName, 'package.json'), 'utf8');
  const parsed: unknown = JSON.parse(source);
  const manifest = PackageManifestSchema.parse(parsed);
  return new Set([...Object.keys(manifest.dependencies), ...Object.keys(manifest.devDependencies)]);
}

async function packageSource(packageName: 'contracts' | 'database'): Promise<string> {
  const sourceFiles =
    packageName === 'contracts' ? ['index.ts', 'workshop.ts'] : ['index.ts', 'schema.ts'];
  return (
    await Promise.all(
      sourceFiles.map((fileName) =>
        readFile(path.join(packagesDir, packageName, 'src', fileName), 'utf8'),
      ),
    )
  ).join('\n');
}

describe('dependency boundary policy', () => {
  it('contracts has no database or React dependencies', async () => {
    const dependencies = await packageDependencies('contracts');
    expect(dependencies).not.toContain('@workshop/database');
    expect(dependencies).not.toContain('drizzle-orm');
    expect(dependencies).not.toContain('pg');
    expect(dependencies).not.toContain('react');
  });

  it('database has no contracts or React dependencies', async () => {
    const dependencies = await packageDependencies('database');
    expect(dependencies).not.toContain('@workshop/contracts');
    expect(dependencies).not.toContain('react');
  });

  it('contracts source exposes no database or React boundary', async () => {
    const source = await packageSource('contracts');
    expect(source).not.toContain('@workshop/database');
    expect(source).not.toContain('drizzle-orm');
    expect(source).not.toContain('react');
  });

  it('database source does not import contracts or React', async () => {
    const source = await packageSource('database');
    expect(source).not.toContain('@workshop/contracts');
    expect(source).not.toContain('react');
  });
});
