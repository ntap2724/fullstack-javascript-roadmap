import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

function resolvePnpmVersion() {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath) {
    return execFileSync(process.execPath, [npmExecPath, '--version'], {
      encoding: 'utf8',
      shell: false,
    }).trim();
  }

  if (process.platform === 'win32') {
    const commandProcessor = process.env.ComSpec ?? 'cmd.exe';

    return execFileSync(
      commandProcessor,
      ['/d', '/s', '/c', 'corepack pnpm --version'],
      {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      },
    ).trim();
  }

  return execFileSync('corepack', ['pnpm', '--version'], {
    encoding: 'utf8',
    shell: false,
  }).trim();
}

const nodeVersion = process.versions.node;
if (!nodeVersion.startsWith('24.')) {
  throw new Error(`Expected Node.js 24.x, observed ${nodeVersion}`);
}

const pnpmVersion = resolvePnpmVersion();

await writeFile('.node-version', `${nodeVersion}\n`);
await writeFile('.pnpm-version', `${pnpmVersion}\n`);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
packageJson.engines = { node: '>=24 <25' };
packageJson.packageManager = `pnpm@${pnpmVersion}`;
await writeFile('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
