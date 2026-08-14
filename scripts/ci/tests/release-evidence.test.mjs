import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { requiredEvidence, verifyRelease0Evidence } from '../../verify-release-0.mjs';

const commit = '0123456789abcdef0123456789abcdef01234567';

async function writeRecord(root, relative, value) {
  const absolute = path.join(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  await writeFile(absolute, bytes);
  return {
    path: relative,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-release-evidence-'));
  const records = [];
  for (const relative of requiredEvidence) {
    const id = relative.startsWith('spikes/')
      ? path.basename(relative, '.json')
      : path.basename(relative, '.json');
    records.push(
      await writeRecord(root, relative, {
        schemaVersion: 1,
        id,
        status: 'passed',
        sourceCommit: commit,
      }),
    );
  }
  await writeFile(
    path.join(root, 'manifest.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      sourceCommit: commit,
      files: records,
    })}\n`,
  );
  return root;
}

async function replaceEvidence(root, relative, value) {
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const replacement = await writeRecord(root, relative, value);
  manifest.files = manifest.files.map((record) =>
    record.path === relative ? replacement : record,
  );
  await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
}

test('accepts a complete same-commit evidence package', async () => {
  const root = await fixture();
  assert.deepEqual(await verifyRelease0Evidence(root), {
    status: 'passed',
    sourceCommit: commit,
    files: requiredEvidence.length,
  });
});

test('RELEASE_EVIDENCE_001 names a missing required file', async () => {
  const root = await fixture();
  await rm(path.join(root, 'platform/windows-2025.json'));
  await assert.rejects(
    () => verifyRelease0Evidence(root),
    /RELEASE_EVIDENCE_001: missing platform\/windows-2025\.json/,
  );
});

test('RELEASE_EVIDENCE_002 rejects a recomputed record from another commit', async () => {
  const root = await fixture();
  await replaceEvidence(root, 'spikes/curriculum-graph.json', {
    schemaVersion: 1,
    id: 'curriculum-graph',
    status: 'passed',
    sourceCommit: 'f'.repeat(40),
  });
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_002/);
});

test('RELEASE_EVIDENCE_003 rejects a recomputed failed record', async () => {
  const root = await fixture();
  await replaceEvidence(root, 'spikes/leak-prevention.json', {
    schemaVersion: 1,
    id: 'leak-prevention',
    status: 'failed',
    sourceCommit: commit,
  });
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_003/);
});

test('RELEASE_EVIDENCE_004 rejects byte drift against the manifest', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'browser/all.json'), '{"tampered":true}\n');
  await assert.rejects(() => verifyRelease0Evidence(root), /RELEASE_EVIDENCE_004/);
});
