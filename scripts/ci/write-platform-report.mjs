import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [platformId, output] = process.argv.slice(2);
if (!platformId || !output || !/^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '')) {
  throw new Error('Usage: write-platform-report.mjs <platform-id> <output> with GITHUB_SHA');
}
await mkdir(path.dirname(output), { recursive: true });
await writeFile(
  output,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'platform',
      id: platformId,
      status: 'passed',
      sourceCommit: process.env.GITHUB_SHA,
      workflowRun: process.env.GITHUB_RUN_ID,
      command: 'pnpm verify:release',
    },
    null,
    2,
  )}\n`,
);
