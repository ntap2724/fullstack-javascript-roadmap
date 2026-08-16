import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output = process.argv[2];
if (!output || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) {
  throw new Error('Usage: write-browser-report.mjs <output> with GITHUB_SHA');
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'browser',
      id: 'chromium-firefox-webkit',
      status: 'passed',
      sourceCommit: process.env.GITHUB_SHA,
      workflowRun: process.env.GITHUB_RUN_ID,
      projects: ['chromium', 'firefox', 'webkit'],
    },
    null,
    2,
  )}\n`,
);
