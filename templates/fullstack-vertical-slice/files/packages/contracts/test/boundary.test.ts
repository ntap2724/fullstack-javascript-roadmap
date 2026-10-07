import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// boundary.test.ts is at packages/contracts/test/boundary.test.ts
// Go up 4 levels: test -> contracts -> packages -> files
const filesRoot = path.join(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const packagesDir = path.join(filesRoot, 'packages');
const sourceModuleExtension = /\.[cm]?[jt]sx?$/;

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

async function sourceModules(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceModules(candidate)));
    } else if (entry.isFile() && sourceModuleExtension.test(entry.name)) {
      files.push(candidate);
    }
  }
  return files.sort();
}

/**
 * Reads the package's whole source tree, not a fixed list of files. A boundary
 * that only inspected today's modules would be silent about the module a learner
 * adds tomorrow — which is exactly where a database type would leak into the
 * shared wire contracts.
 */
async function packageSource(packageName: 'contracts' | 'database'): Promise<string> {
  const files = await sourceModules(path.join(packagesDir, packageName, 'src'));
  expect(files.length, `${packageName} must expose source modules to scan`).toBeGreaterThan(0);
  return (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
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
    expect(source).not.toContain('pg');
    expect(source).not.toContain('react');
  });

  it('database source does not import contracts or React', async () => {
    const source = await packageSource('database');
    expect(source).not.toContain('@workshop/contracts');
    expect(source).not.toContain('react');
  });
});
