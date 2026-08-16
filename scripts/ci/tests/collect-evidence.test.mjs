import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEvidence } from '../collect-evidence.mjs';

test('copies allowlisted files and records path, bytes, and sha256', async () => {
  const input = await mkdtemp(path.join(tmpdir(), 'roadmap-evidence-input-'));
  const output = await mkdtemp(path.join(tmpdir(), 'roadmap-evidence-output-'));
  await writeFile(path.join(input, 'verify.json'), '{"status":"passed"}\n');
  await collectEvidence({
    outputRoot: output,
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-07-26T12:00:00.000Z',
    workflowRun: '123',
    files: [{ source: path.join(input, 'verify.json'), target: 'reports/verify.json' }],
  });
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files[0].path, 'reports/verify.json');
  assert.match(manifest.files[0].sha256, /^[0-9a-f]{64}$/);
});

test('rejects absolute and parent-traversing targets', async () => {
  await assert.rejects(
    () =>
      collectEvidence({
        outputRoot: '.tmp/evidence',
        sourceCommit: '0123456789abcdef0123456789abcdef01234567',
        generatedAt: '2026-07-26T12:00:00.000Z',
        workflowRun: '123',
        files: [{ source: 'README.md', target: '../README.md' }],
      }),
    /unsafe evidence target/,
  );
});
