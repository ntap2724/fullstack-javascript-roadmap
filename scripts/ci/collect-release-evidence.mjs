import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { collectEvidence } from './collect-evidence.mjs';

const downloaded = '.tmp/downloaded';
const outputRoot = '.tmp/release-evidence';
const sourceCommit = process.env.GITHUB_SHA;
if (!/^[0-9a-f]{40}$/.test(sourceCommit ?? '')) throw new Error('GITHUB_SHA must be a full commit');

const inputFiles = {
  ubuntu: `${downloaded}/ubuntu/platform/ubuntu-24.04.json`,
  windows: `${downloaded}/windows/platform/windows-2025.json`,
  browser: `${downloaded}/browser/all.json`,
  negative: `${downloaded}/ubuntu/negative-fixtures/report.json`,
  template: `${downloaded}/ubuntu/templates/javascript-engineering.json`,
};

for (const [name, file] of Object.entries(inputFiles)) {
  const value = JSON.parse(await readFile(file, 'utf8'));
  if (value.status !== 'passed' || value.sourceCommit !== sourceCommit) {
    throw new Error(`${name} evidence is not passed evidence for ${sourceCommit}`);
  }
}

const derivedRoot = '.tmp/derived-spikes';
await mkdir(derivedRoot, { recursive: true });
const spikes = [
  ['curriculum-to-starlight', ['platform/ubuntu-24.04.json', 'browser/all.json']],
  ['curriculum-graph', ['negative-fixtures/report.json']],
  ['template-publication', ['templates/javascript-engineering/report.json']],
  ['cross-platform', ['platform/ubuntu-24.04.json', 'platform/windows-2025.json']],
  [
    'leak-prevention',
    ['negative-fixtures/report.json', 'templates/javascript-engineering/report.json'],
  ],
];
for (const [id, evidence] of spikes) {
  await writeFile(
    path.join(derivedRoot, `${id}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'spike',
        id,
        status: 'passed',
        sourceCommit,
        evidence,
      },
      null,
      2,
    )}\n`,
  );
}

await collectEvidence({
  outputRoot,
  sourceCommit,
  generatedAt: new Date().toISOString(),
  workflowRun: process.env.GITHUB_RUN_ID ?? 'local',
  files: [
    { source: inputFiles.ubuntu, target: 'platform/ubuntu-24.04.json' },
    { source: inputFiles.windows, target: 'platform/windows-2025.json' },
    { source: inputFiles.browser, target: 'browser/all.json' },
    { source: inputFiles.negative, target: 'negative-fixtures/report.json' },
    { source: inputFiles.template, target: 'templates/javascript-engineering/report.json' },
    ...spikes.map(([id]) => ({
      source: `${derivedRoot}/${id}.json`,
      target: `spikes/${id}.json`,
    })),
  ],
});
