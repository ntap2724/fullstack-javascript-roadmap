import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareManifestTriplet,
  hashFile,
  manifestsMatchExactly,
  readBaselineManifest,
  writeBaselineManifest,
  type ExerciseBaselineManifest,
  type WorkspaceFileManifest,
} from '../src/baseline-manifest.js';
import { createProductionMaterializeFilesystemAdapter } from '../src/materialization-filesystem.js';

describe('materialization filesystem adapter', () => {
  it('owns exactly the eight real lifecycle operations and no fault hook', () => {
    const adapter = createProductionMaterializeFilesystemAdapter();
    expect(Object.keys(adapter).sort()).toEqual([
      'cleanupOwnedMaterialization',
      'createOwnedStage',
      'finalizeOwnedReservation',
      'inspectOutputState',
      'populateReservedDirectory',
      'removeOwnedStage',
      'reserveMissingDirectory',
      'validateOwnedInventory',
    ]);
    expect(Object.keys(adapter)).not.toContain('faultHook');
  });

  it('distinguishes a missing, empty, and unknown target without deleting it', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-output-state-'));
    try {
      const target = path.join(parent, 'workspace');
      const adapter = createProductionMaterializeFilesystemAdapter();
      await expect(adapter.inspectOutputState(target)).resolves.toBe('missing');
      await mkdir(target);
      await expect(adapter.inspectOutputState(target)).resolves.toBe('existing-empty');
      await mkdir(path.join(target, 'learner'));
      await expect(adapter.inspectOutputState(target)).resolves.toBe('non-empty-unknown');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('recognizes a matching-valid target and rejects malformed baseline metadata as invalid', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-output-classifications-'));
    try {
      const target = path.join(parent, 'matching');
      await mkdir(path.join(target, '.roadmap'), { recursive: true });
      await writeFile(path.join(target, 'learner.js'), 'export const learner = true;\n');
      const record = await hashFile(path.join(target, 'learner.js'), 'learner.js');
      await writeBaselineManifest(path.join(target, '.roadmap', 'exercise-baseline.json'), {
        schemaVersion: 1,
        exerciseId: 'ex-output-classification',
        exerciseVersion: '1.0.0',
        files: [record],
      });
      const adapter = createProductionMaterializeFilesystemAdapter();
      await expect(adapter.inspectOutputState(target)).resolves.toBe('matching-valid');

      const invalid = path.join(parent, 'invalid');
      await mkdir(path.join(invalid, '.roadmap'), { recursive: true });
      await writeFile(path.join(invalid, '.roadmap', 'exercise-baseline.json'), '{invalid\n');
      await expect(adapter.inspectOutputState(invalid)).resolves.toBe('invalid');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it.each([
    ['identity', { exerciseId: 'EX-INVALID', exerciseVersion: '1.0.0' }],
    ['semver', { exerciseId: 'ex-valid', exerciseVersion: '1.0' }],
  ])('rejects invalid manifest %s provenance', async (label, provenance) => {
    const parent = await mkdtemp(path.join(tmpdir(), `roadmap-manifest-${label}-`));
    try {
      const file = path.join(parent, 'manifest.json');
      await writeFile(
        file,
        JSON.stringify({
          schemaVersion: 1,
          exerciseId: provenance.exerciseId,
          exerciseVersion: provenance.exerciseVersion,
          files: [],
        }),
      );
      await expect(readBaselineManifest(file)).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects strict manifest unknown keys, noncanonical order, case aliases, bytes, and hashes', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-manifest-negative-'));
    try {
      const cases: readonly unknown[] = [
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [],
          extra: true,
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [
            { path: 'z.js', bytes: 1, sha256: '0'.repeat(64) },
            { path: 'a.js', bytes: 1, sha256: '0'.repeat(64) },
          ],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [
            { path: 'A.js', bytes: 1, sha256: '0'.repeat(64) },
            { path: 'a.js', bytes: 1, sha256: '0'.repeat(64) },
          ],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [{ path: './a.js', bytes: 1, sha256: '0'.repeat(64) }],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [{ path: 'a\\b.js', bytes: 1, sha256: '0'.repeat(64) }],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [{ path: 'a.js', bytes: -1, sha256: '0'.repeat(64) }],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [{ path: 'a.js', bytes: 1, sha256: 'not-a-hash' }],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [
            { path: 'a.js', bytes: 1, sha256: '0'.repeat(64) },
            { path: 'a.js', bytes: 1, sha256: '0'.repeat(64) },
          ],
        },
        {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: [{ path: 'a.js', bytes: 1, sha256: '0'.repeat(64), extra: true }],
        },
      ];
      for (const [index, value] of cases.entries()) {
        const file = path.join(parent, `manifest-${String(index)}.json`);
        await writeFile(file, JSON.stringify(value));
        await expect(readBaselineManifest(file)).rejects.toThrow();
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects sparse and accessor-backed manifest arrays before writing', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-manifest-shape-'));
    try {
      const sparse: Array<{ path: string; bytes: number; sha256: string }> = [
        { path: 'a.js', bytes: 1, sha256: '0'.repeat(64) },
      ];
      sparse.length = 2;
      await expect(
        writeBaselineManifest(path.join(parent, 'sparse.json'), {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: sparse,
        }),
      ).rejects.toThrow();

      const accessor: Array<{ path: string; bytes: number; sha256: string }> = [
        { path: 'a.js', bytes: 1, sha256: '0'.repeat(64) },
      ];
      Object.defineProperty(accessor, '0', {
        configurable: true,
        enumerable: true,
        get: () => ({ path: 'a.js', bytes: 1, sha256: '0'.repeat(64) }),
      });
      await expect(
        writeBaselineManifest(path.join(parent, 'accessor.json'), {
          schemaVersion: 1,
          exerciseId: 'ex-valid',
          exerciseVersion: '1.0.0',
          files: accessor,
        }),
      ).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('fails closed when typed manifest comparison inputs contain duplicate records', () => {
    const record = { path: 'learner.js', bytes: 1, sha256: '0'.repeat(64) };
    const baseline: ExerciseBaselineManifest = {
      schemaVersion: 1,
      exerciseId: 'ex-valid',
      exerciseVersion: '1.0.0',
      files: [record],
    };
    const duplicate: ExerciseBaselineManifest = {
      ...baseline,
      files: [record, { ...record }],
    };
    const malformedCurrent: WorkspaceFileManifest = {
      schemaVersion: 1,
      files: [record, { ...record }],
    };
    expect(manifestsMatchExactly(baseline, duplicate)).toBe(false);
    const comparison = compareManifestTriplet(baseline, baseline, malformedCurrent, ['**']);
    expect(comparison.ok).toBe(false);
  });

  it('fails closed when validation is asked to inspect a missing reservation root', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-missing-reservation-'));
    try {
      const adapter = createProductionMaterializeFilesystemAdapter();
      await expect(
        adapter.validateOwnedInventory({
          root: path.join(parent, 'missing'),
          ownershipToken: 'token',
          expectedInventory: ['learner.js'],
          controlPaths: ['.roadmap/reservation-ownership-token'],
        }),
      ).rejects.toThrow();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
