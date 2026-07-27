import { readFile } from 'node:fs/promises';
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
