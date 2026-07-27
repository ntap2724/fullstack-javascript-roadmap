import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

async function text(filePath) {
  return (await readFile(filePath, 'utf8')).trim();
}

test('Node.js runtime is an exact 24.x version and matches .node-version', async () => {
  const pinned = await text('.node-version');
  assert.match(pinned, /^24\.\d+\.\d+$/);
  assert.equal(process.versions.node, pinned);
});

test('workspace policy rejects cycles and empty filters', async () => {
  const workspace = await text('pnpm-workspace.yaml');
  assert.match(workspace, /disallowWorkspaceCycles:\s*true/);
  assert.match(workspace, /failIfNoMatch:\s*true/);
});

const EXACT_STABLE_SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function resolveActivePnpmVersion() {
  const npmExecPath = process.env.npm_execpath;
  let command;
  let args;

  if (npmExecPath) {
    command = process.execPath;
    args = [npmExecPath, '--version'];
  } else if (process.platform === 'win32') {
    command = process.env.ComSpec ?? 'cmd.exe';
    args = ['/d', '/s', '/c', 'corepack pnpm --version'];
  } else {
    command = 'corepack';
    args = ['pnpm', '--version'];
  }

  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    windowsHide: process.platform === 'win32' && !npmExecPath,
  });
  const diagnostic = [
    `stdout:\n${result.stdout ?? ''}`,
    `stderr:\n${result.stderr ?? ''}`,
    `error:\n${result.error?.stack ?? String(result.error ?? '')}`,
  ].join('\n');

  assert.ifError(result.error);
  assert.equal(result.status, 0, diagnostic);

  const active = (result.stdout ?? '').trim();
  assert.notEqual(active, '', diagnostic);
  assert.match(active, EXACT_STABLE_SEMVER, diagnostic);
  return active;
}

function assertPnpmPinContract(packageJson, pinned, active) {
  assert.match(pinned, EXACT_STABLE_SEMVER);
  assert.match(active, EXACT_STABLE_SEMVER);
  assert.equal(pinned, active);
  assert.equal(packageJson.packageManager, `pnpm@${active}`);
}

test('packageManager pins the exact active pnpm version', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const pinned = await text('.pnpm-version');
  const active = resolveActivePnpmVersion();

  assertPnpmPinContract(packageJson, pinned, active);
});

test('pnpm pin policy rejects latest even when repository records agree', () => {
  const active = resolveActivePnpmVersion();

  assert.throws(
    () =>
      assertPnpmPinContract(
        { packageManager: 'pnpm@latest' },
        'latest',
        active,
      ),
    (error) => {
      assert.equal(error.code, 'ERR_ASSERTION');
      assert.equal(error.actual, 'latest');
      assert.match(error.message, /expected to match|did not match/i);
      return true;
    },
  );
});

test('direct Node typings stay on the exact Node 24 line', async () => {
  const packageJson = JSON.parse(await text('package.json'));
  const nodeTypesVersion = packageJson.devDependencies?.['@types/node'];

  assert.match(
    nodeTypesVersion,
    /^24\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  );
  assert.equal(nodeTypesVersion, '24.13.3');

  const lockfile = await text('pnpm-lock.yaml');
  assert.match(
    lockfile,
    /importers:\r?\n\r?\n  \.[\s\S]*?\n      '@types\/node':\r?\n        specifier: 24\.13\.3\r?\n        version: 24\.13\.3(?:\r?\n|$)/,
  );
});

test('pin script rejects a non-exact pnpm version before writing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-toolchain-invalid-pnpm-'));
  const packageJsonPath = path.join(root, 'package.json');
  const nodeVersionPath = path.join(root, '.node-version');
  const pnpmVersionPath = path.join(root, '.pnpm-version');
  const fakePnpmPath = path.join(root, 'fake-pnpm.mjs');
  const originalPackageJson =
    `${JSON.stringify(
      {
        name: 'pin-toolchain-invalid-pnpm',
        version: '0.0.0',
        private: true,
        type: 'module',
        engines: { node: '>=24 <25' },
        packageManager: 'pnpm@11.9.0',
      },
      null,
      2,
    )}\n`;
  const originalNodeVersion = 'sentinel-node\n';
  const originalPnpmVersion = 'sentinel-pnpm\n';

  try {
    await writeFile(packageJsonPath, originalPackageJson);
    await writeFile(nodeVersionPath, originalNodeVersion);
    await writeFile(pnpmVersionPath, originalPnpmVersion);
    await writeFile(fakePnpmPath, "process.stdout.write('latest\\n');\n");

    const script = fileURLToPath(new URL('./pin-toolchain.mjs', import.meta.url));
    const env = { ...process.env };

    for (const key of Object.keys(env)) {
      if (key.toLowerCase() === 'npm_execpath') {
        delete env[key];
      }
    }

    env.npm_execpath = fakePnpmPath;

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

    assert.notEqual(result.status, 0, diagnostic);
    assert.match(result.stderr ?? '', /exact stable pnpm version/i);
    assert.deepEqual(await readFile(packageJsonPath), Buffer.from(originalPackageJson));
    assert.deepEqual(await readFile(nodeVersionPath), Buffer.from(originalNodeVersion));
    assert.deepEqual(await readFile(pnpmVersionPath), Buffer.from(originalPnpmVersion));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    assert.match(pnpmVersion, EXACT_STABLE_SEMVER);
    assert.equal(packageJson.packageManager, `pnpm@${pnpmVersion}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
