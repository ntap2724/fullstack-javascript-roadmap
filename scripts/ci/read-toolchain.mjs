import { readFile } from 'node:fs/promises';
import path from 'node:path';

const exactSemver = /^\d+\.\d+\.\d+$/;

export async function readToolchain(root = process.cwd()) {
  const node = (await readFile(path.join(root, '.node-version'), 'utf8')).trim();
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const pnpmMatch = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');
  if (!exactSemver.test(node) || !node.startsWith('24.') || !pnpmMatch) {
    throw new Error('Toolchain files must contain exact Node 24 and pnpm semantic versions');
  }
  return { node, pnpm: pnpmMatch[1] };
}

export function resolvePnpmInvocation(args, environment = {}) {
  const npmExecPath = environment.npmExecPath ?? process.env.npm_execpath;
  const platform = environment.platform ?? process.platform;
  const execPath = environment.execPath ?? process.execPath;
  if (npmExecPath) return { command: execPath, args: [npmExecPath, ...args] };
  if (platform === 'win32')
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm', ...args] };
  return { command: 'pnpm', args };
}
