import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const requiredEvidence = [
  'platform/ubuntu-24.04.json',
  'platform/windows-2025.json',
  'browser/all.json',
  'spikes/curriculum-to-starlight.json',
  'spikes/curriculum-graph.json',
  'spikes/template-publication.json',
  'spikes/cross-platform.json',
  'spikes/leak-prevention.json',
  'negative-fixtures/report.json',
  'templates/javascript-engineering/report.json',
  'wp10/vertical-slice-skeleton.json',
  'wp10/release-1-backlog.json',
  'wp10/fullstack-template.json',
];

export async function verifyRelease0Evidence(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  } catch {
    throw new Error('RELEASE_EVIDENCE_001: manifest.json is missing or invalid');
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '')) {
    throw new Error('RELEASE_EVIDENCE_002: manifest source commit is invalid');
  }
  const records = new Map(manifest.files.map((record) => [record.path, record]));
  for (const relative of requiredEvidence) {
    const record = records.get(relative);
    if (!record) throw new Error(`RELEASE_EVIDENCE_001: missing ${relative}`);
    let bytes;
    try {
      bytes = await readFile(path.join(root, relative));
    } catch {
      throw new Error(`RELEASE_EVIDENCE_001: missing ${relative}`);
    }
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== record.sha256 || bytes.byteLength !== record.bytes) {
      throw new Error(`RELEASE_EVIDENCE_004: hash or byte mismatch for ${relative}`);
    }
    const value = JSON.parse(bytes.toString('utf8'));
    if (value.sourceCommit !== manifest.sourceCommit) {
      throw new Error(`RELEASE_EVIDENCE_002: commit mismatch in ${relative}`);
    }
    if (value.status !== 'passed') {
      throw new Error(`RELEASE_EVIDENCE_003: failed status in ${relative}`);
    }
  }

  const allowedSpikeIds = new Set([
    'curriculum-to-starlight',
    'curriculum-graph',
    'template-publication',
    'cross-platform',
    'leak-prevention',
  ]);
  const seen = new Set();
  for (const relative of requiredEvidence.filter((entry) => entry.startsWith('spikes/'))) {
    const value = JSON.parse(await readFile(path.join(root, relative), 'utf8'));
    if (!allowedSpikeIds.has(value.id) || seen.has(value.id)) {
      throw new Error(`RELEASE_EVIDENCE_003: duplicate or unrecognized spike ${value.id}`);
    }
    seen.add(value.id);
  }
  return { status: 'passed', sourceCommit: manifest.sourceCommit, files: requiredEvidence.length };
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invoked === fileURLToPath(import.meta.url)) {
  const root = process.argv[2];
  if (!root) throw new Error('Usage: verify-release-0.mjs <evidence-root>');
  console.log(JSON.stringify(await verifyRelease0Evidence(root)));
}
