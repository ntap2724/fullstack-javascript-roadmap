import { cp, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadExercise,
  materializeExercise,
  readBaselineManifest,
  verifyEditablePaths,
} from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

async function prepareWorkspace() {
  const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-editable-task4-'));
  const output = path.join(parent, 'workspace');
  const materialized = await materializeExercise(fixture, output);
  const definition = await loadExercise(fixture);
  if (!materialized.ok || !definition.ok) {
    await rm(parent, { recursive: true, force: true });
    throw new Error('Task 3 fixture must materialize and load');
  }
  return { parent, output, workspace: materialized.value, definition: definition.value };
}

describe('verifyEditablePaths', () => {
  it.each(['addition', 'deletion'])('allows an editable src %s', async (kind) => {
    const prepared = await prepareWorkspace();
    const editable = path.join(prepared.output, 'src', 'learner-change.js');
    const starter = path.join(prepared.output, 'src/counter.js');
    try {
      if (kind === 'addition') {
        await writeFile(editable, 'export const learnerChange = true;\n');
      } else {
        await rm(starter);
      }
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([
          kind === 'addition' ? 'src/learner-change.js' : 'src/counter.js',
        ]);
      }
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('allows edits under src and rejects a protected test modification', async () => {
    const prepared = await prepareWorkspace();
    try {
      await writeFile(
        path.join(prepared.output, 'src/counter.js'),
        'export const changed = true;\n',
      );
      const allowed = await verifyEditablePaths(prepared.workspace, prepared.definition, [
        'src/**',
      ]);
      expect(allowed.ok).toBe(true);
      if (allowed.ok) expect(allowed.value).toEqual(['src/counter.js']);

      const protectedFile = path.join(prepared.output, 'test/open/counter.contract.test.js');
      await writeFile(protectedFile, `${await readFile(protectedFile, 'utf8')}\n// modified\n`);
      const rejected = await verifyEditablePaths(prepared.workspace, prepared.definition, [
        'src/**',
      ]);
      expect(rejected.ok).toBe(false);
      if (!rejected.ok) {
        expect(rejected.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
        expect(rejected.diagnostics[0]?.location.file).toBe('test/open/counter.contract.test.js');
      }
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it.each(['deletion', 'addition', 'rename'])('rejects protected %s', async (kind) => {
    const prepared = await prepareWorkspace();
    const protectedFile = path.join(prepared.output, 'test/open/counter.contract.test.js');
    try {
      if (kind === 'deletion') {
        await rm(protectedFile);
      } else if (kind === 'addition') {
        await writeFile(path.join(prepared.output, 'test/open/unexpected.test.js'), 'test\n');
      } else {
        await rename(protectedFile, path.join(prepared.output, 'test/open/renamed.test.js'));
      }
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_001');
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects a case-only protected alias or rename', async () => {
    const prepared = await prepareWorkspace();
    const original = path.join(prepared.output, 'test/open/counter.contract.test.js');
    const caseVariant = path.join(prepared.output, 'test/open/Counter.Contract.test.js');
    try {
      if (process.platform === 'win32') {
        await rename(original, caseVariant);
      } else {
        await writeFile(caseVariant, await readFile(original));
      }
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['EXERCISE_EDITABLE_001', 'EXERCISE_EDITABLE_002']).toContain(
          result.diagnostics[0]?.code,
        );
      }
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it.each(['hash', 'replay'])('rejects a cached manifest %s', async (kind) => {
    const prepared = await prepareWorkspace();
    try {
      const manifest = await readBaselineManifest(prepared.workspace.baselineManifestPath);
      const tampered =
        kind === 'hash'
          ? {
              ...manifest,
              files: manifest.files.map((record, index) =>
                index === 0 ? { ...record, sha256: '0'.repeat(64) } : record,
              ),
            }
          : { ...manifest, exerciseId: 'ex-replayed', exerciseVersion: '9.9.9' };
      await writeFile(
        prepared.workspace.baselineManifestPath,
        `${JSON.stringify(tampered, null, 2)}\n`,
      );
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('EXERCISE_WORKSPACE_001');
        expect(JSON.stringify(result.diagnostics)).not.toContain(prepared.parent);
      }
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it.each(['missing', 'malformed', 'unknown'])('fails closed for a %s baseline', async (kind) => {
    const prepared = await prepareWorkspace();
    try {
      if (kind === 'missing') {
        await rm(prepared.workspace.baselineManifestPath);
      } else if (kind === 'malformed') {
        await writeFile(prepared.workspace.baselineManifestPath, '{not-json\n');
      } else {
        const manifest = await readBaselineManifest(prepared.workspace.baselineManifestPath);
        await writeFile(
          prepared.workspace.baselineManifestPath,
          `${JSON.stringify({ ...manifest, extra: true }, null, 2)}\n`,
        );
      }
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
        expect(JSON.stringify(result.diagnostics)).not.toContain(prepared.parent);
      }
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects unexpected control content without deleting its bytes', async () => {
    const prepared = await prepareWorkspace();
    const unexpected = path.join(prepared.output, '.roadmap/foreign.txt');
    try {
      await writeFile(unexpected, 'preserve me\n');
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
      expect(await readFile(unexpected, 'utf8')).toBe('preserve me\n');
    } finally {
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects a symlink or junction injected after materialization', async () => {
    const prepared = await prepareWorkspace();
    const alias = path.join(
      prepared.output,
      process.platform === 'win32' ? 'linked-src' : 'answer.js',
    );
    try {
      await symlink(
        process.platform === 'win32'
          ? path.join(prepared.output, 'src')
          : path.join(prepared.output, 'src/counter.js'),
        alias,
        process.platform === 'win32' ? 'junction' : 'file',
      );
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
    } finally {
      await unlink(alias).catch(() => undefined);
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });

  it('rejects replacement of the accepted workspace root by an alias', async () => {
    const prepared = await prepareWorkspace();
    const outside = path.join(prepared.parent, 'outside');
    try {
      await cp(path.join(prepared.parent, 'workspace'), outside, { recursive: true });
      await rm(prepared.output, { recursive: true, force: true });
      await symlink(outside, prepared.output, process.platform === 'win32' ? 'junction' : 'dir');
      const result = await verifyEditablePaths(prepared.workspace, prepared.definition, ['src/**']);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.diagnostics[0]?.code).toBe('EXERCISE_EDITABLE_002');
    } finally {
      await unlink(prepared.output).catch(() => undefined);
      await rm(prepared.parent, { recursive: true, force: true });
    }
  });
});
