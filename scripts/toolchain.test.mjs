import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

async function text(path) {
  return (await readFile(path, 'utf8')).trim();
}

test('Node.js runtime is an exact 24.x version and matches .node-version', async () => {
  const pinned = await text('.node-version');
  assert.match(pinned, /^24\.\d+\.\d+$/);
  assert.equal(process.versions.node, pinned);
});

test('packageManager pins the active pnpm version', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const expected = await text('.pnpm-version');
  assert.equal(packageJson.packageManager, `pnpm@${expected}`);
});

test('workspace policy rejects cycles and empty filters', async () => {
  const workspace = await text('pnpm-workspace.yaml');
  assert.match(workspace, /disallowWorkspaceCycles:\s*true/);
  assert.match(workspace, /failIfNoMatch:\s*true/);
});

test('pin script resolves pnpm without npm_execpath', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-'));

  try {
    await writeFile(
      path.join(root, 'package.json'),
      `${JSON.stringify(
        {
          name: 'pin-toolchain-regression',
          version: '0.0.0',
          private: true,
          type: 'module',
          engines: { node: '>=24 <25' },
        },
        null,
        2,
      )}\n`,
    );

    const script = fileURLToPath(new URL('./pin-toolchain.mjs', import.meta.url));
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'npm_execpath') {
        delete env[key];
      }
    }

    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: 'utf8',
      env,
      shell: false,
    });
    const diagnostic = [
      `stdout:\n${result.stdout ?? ''}`,
      `stderr:\n${result.stderr ?? ''}`,
      `error:\n${result.error?.stack ?? String(result.error ?? '')}`,
    ].join('\n');

    assert.equal(result.status, 0, diagnostic);

    const nodeVersion = (await readFile(path.join(root, '.node-version'), 'utf8')).trim();
    const pnpmVersion = (await readFile(path.join(root, '.pnpm-version'), 'utf8')).trim();
    const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

    assert.equal(nodeVersion, process.versions.node);
    assert.match(pnpmVersion, /^\d+\.\d+\.\d+$/);
    assert.equal(packageJson.packageManager, `pnpm@${pnpmVersion}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
