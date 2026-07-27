import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const nodeVersion = process.versions.node;
if (!nodeVersion.startsWith('24.')) {
  throw new Error(`Expected Node.js 24.x, observed ${nodeVersion}`);
}

const npmExecPath = process.env.npm_execpath;
const pnpmVersion = npmExecPath
  ? execFileSync(process.execPath, [npmExecPath, '--version'], { encoding: 'utf8', shell: false }).trim()
  : execFileSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', '--version'], {
      encoding: 'utf8',
      shell: false,
    }).trim();

await writeFile('.node-version', `${nodeVersion}\n`);
await writeFile('.pnpm-version', `${pnpmVersion}\n`);

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
packageJson.engines = { node: '>=24 <25' };
packageJson.packageManager = `pnpm@${pnpmVersion}`;
await writeFile('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
