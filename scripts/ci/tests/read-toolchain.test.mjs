import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readToolchain, resolvePnpmInvocation } from '../read-toolchain.mjs';

test('reads exact Node 24 and pnpm versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-'));
  await writeFile(path.join(root, '.node-version'), '24.16.0\n');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ packageManager: 'pnpm@11.0.0' }),
  );
  assert.deepEqual(await readToolchain(root), { node: '24.16.0', pnpm: '11.0.0' });
});

test('rejects floating and wrong-family versions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-invalid-'));
  await writeFile(path.join(root, '.node-version'), '26.0.0\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11' }));
  await assert.rejects(() => readToolchain(root), /exact Node 24 and pnpm semantic versions/);
});

test('uses the active pnpm JavaScript entry point without a shell', () => {
  const invocation = resolvePnpmInvocation(['--version'], {
    npmExecPath: '/tools/pnpm.cjs',
    platform: 'win32',
    execPath: 'C:\\node\\node.exe',
  });
  assert.deepEqual(invocation, {
    command: 'C:\\node\\node.exe',
    args: ['/tools/pnpm.cjs', '--version'],
  });
});
