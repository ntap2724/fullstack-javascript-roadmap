import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadExercise,
  materializeExercise,
  openExerciseWorkspace,
  readBaselineManifest,
} from '../src/index.js';

const fixture = new URL('../../../fixtures/exercises/valid/minimal/', import.meta.url);

describe('openExerciseWorkspace', () => {
  it('returns stable loader diagnostics for malformed metadata and non-file URLs', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-loader-'));
    try {
      await writeFile(path.join(parent, 'exercise.yaml'), 'schemaVersion: 1\n');
      const malformed = await loadExercise(parent);
      expect(malformed.ok).toBe(false);
      if (!malformed.ok) {
        expect(malformed.diagnostics[0]?.code).toBe('EXERCISE_SCHEMA_001');
        expect(JSON.stringify(malformed.diagnostics)).not.toContain(parent);
      }
      const nonFile = await loadExercise(new URL('https://example.invalid/exercise/'));
      expect(nonFile.ok).toBe(false);
      if (!nonFile.ok) expect(nonFile.diagnostics[0]?.code).toBe('EXERCISE_LOAD_001');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('maps missing metadata and syntactically malformed YAML to nonleaking LOAD_001', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-loader-failures-'));
    try {
      const missing = await loadExercise(path.join(parent, 'missing'));
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.diagnostics[0]?.code).toBe('EXERCISE_LOAD_001');

      await writeFile(path.join(parent, 'exercise.yaml'), 'id: [\n');
      const malformed = await loadExercise(parent);
      expect(malformed.ok).toBe(false);
      if (!malformed.ok) {
        expect(malformed.diagnostics[0]?.code).toBe('EXERCISE_LOAD_001');
        expect(JSON.stringify(malformed.diagnostics)).not.toContain(parent);
      }
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('reuses a matching workspace without replacing learner edits', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-open-'));
    try {
      const output = path.join(parent, 'workspace');
      const created = await materializeExercise(fixture, output);
      if (!created.ok) throw new Error('fixture must materialize');
      const learnerSource = 'export const learnerChange = true;\n';
      await writeFile(path.join(output, 'src/counter.js'), learnerSource);
      const reopened = await openExerciseWorkspace(fixture, output);
      expect(reopened.ok).toBe(true);
      expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toBe(learnerSource);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('fails closed on stale exercise provenance without deleting the workspace', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-mismatch-'));
    try {
      const output = path.join(parent, 'workspace');
      const created = await materializeExercise(fixture, output);
      if (!created.ok) throw new Error('fixture must materialize');
      const manifest = await readBaselineManifest(created.value.baselineManifestPath);
      manifest.exerciseVersion = '9.9.9';
      await writeFile(created.value.baselineManifestPath, JSON.stringify(manifest, null, 2) + '\n');
      const reopened = await openExerciseWorkspace(fixture, output);
      expect(reopened.ok).toBe(false);
      if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_WORKSPACE_001');
      expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toContain(
        'createCounter',
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('fails closed when authoritative source bytes become stale after materialization', async () => {
    const source = await mkdtemp(path.join(tmpdir(), 'roadmap-stale-source-'));
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-stale-source-output-'));
    try {
      await cp(fileURLToPath(fixture), source, { recursive: true });
      const output = path.join(parent, 'workspace');
      const created = await materializeExercise(source, output);
      if (!created.ok) throw new Error('fixture must materialize');
      const originalLearnerBytes = await readFile(path.join(output, 'src/counter.js'), 'utf8');
      await writeFile(path.join(source, 'starter', 'src', 'counter.js'), 'changed source\n');
      const reopened = await openExerciseWorkspace(source, output);
      expect(reopened.ok).toBe(false);
      if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_WORKSPACE_001');
      expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toBe(
        originalLearnerBytes,
      );
    } finally {
      await rm(source, { recursive: true, force: true });
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('returns OUTPUT_002 for a materialized workspace whose baseline is missing', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-missing-baseline-'));
    try {
      const output = path.join(parent, 'workspace');
      const created = await materializeExercise(fixture, output);
      if (!created.ok) throw new Error('fixture must materialize');
      const learnerBytes = await readFile(path.join(output, 'src/counter.js'), 'utf8');
      await rm(created.value.baselineManifestPath);
      const reopened = await openExerciseWorkspace(fixture, output);
      expect(reopened.ok).toBe(false);
      if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_002');
      expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toBe(learnerBytes);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects malformed baseline metadata without deleting learner files', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-malformed-manifest-'));
    try {
      const output = path.join(parent, 'workspace');
      const created = await materializeExercise(fixture, output);
      if (!created.ok) throw new Error('fixture must materialize');
      await writeFile(created.value.baselineManifestPath, '{not-json\n');
      const reopened = await openExerciseWorkspace(fixture, output);
      expect(reopened.ok).toBe(false);
      if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_WORKSPACE_002');
      expect(await readFile(path.join(output, 'src/counter.js'), 'utf8')).toContain(
        'createCounter',
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects a non-empty unknown workspace without deleting its sentinel', async () => {
    const parent = await mkdtemp(path.join(tmpdir(), 'roadmap-unknown-output-'));
    try {
      const output = path.join(parent, 'workspace');
      await mkdir(output);
      const sentinel = path.join(output, 'do-not-delete.txt');
      await writeFile(sentinel, 'learner content\n');
      const reopened = await openExerciseWorkspace(fixture, output);
      expect(reopened.ok).toBe(false);
      if (!reopened.ok) expect(reopened.diagnostics[0]?.code).toBe('EXERCISE_OUTPUT_002');
      expect(await readFile(sentinel, 'utf8')).toBe('learner content\n');
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
