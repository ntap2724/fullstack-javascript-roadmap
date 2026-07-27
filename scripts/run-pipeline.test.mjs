import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './run-pipeline.mjs';

test('pipeline stops after the first failing script', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-pipeline-'));
  const log = path.join(root, 'log.txt');

  try {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        scripts: {
          first: "node -e \"require('fs').appendFileSync('log.txt', 'first\\n')\"",
          fail: 'node -e "process.exit(7)"',
          last: "node -e \"require('fs').appendFileSync('log.txt', 'last\\n')\"",
        },
      }),
    );

    await assert.rejects(() => runPipeline(['first', 'fail', 'last'], { cwd: root }));
    assert.equal(await readFile(log, 'utf8'), 'first\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pipeline rejects an unknown script before execution', async () => {
  await assert.rejects(() => runPipeline(['script-that-does-not-exist']));
});

test('unavailable commands fail closed with exit code 2', () => {
  const command = 'verify:templates';
  const script = fileURLToPath(new URL('./unavailable-command.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script, command], {
    encoding: 'utf8',
    shell: false,
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, new RegExp(`${command} is not available`));
});
