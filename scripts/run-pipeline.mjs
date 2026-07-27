import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function runPipeline(scriptNames, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const packageJson = JSON.parse(await readFile(path.join(cwd, 'package.json'), 'utf8'));

  for (const scriptName of scriptNames) {
    if (typeof packageJson.scripts?.[scriptName] !== 'string') {
      throw new Error(`Unknown package script: ${scriptName}`);
    }
  }

  for (const scriptName of scriptNames) {
    await new Promise((resolve, reject) => {
      const npmExecPath = process.env.npm_execpath;
      const executable = npmExecPath
        ? process.execPath
        : process.platform === 'win32'
          ? 'cmd.exe'
          : 'pnpm';
      const args = npmExecPath
        ? [npmExecPath, 'run', scriptName]
        : process.platform === 'win32'
          ? ['/d', '/s', '/c', 'pnpm', 'run', scriptName]
          : ['run', scriptName];
      const child = spawn(executable, args, {
        cwd,
        shell: false,
        stdio: 'inherit',
      });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${scriptName} failed with code ${code} and signal ${signal}`));
      });
    });
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const scripts = process.argv.slice(2);
  if (scripts.length === 0) throw new Error('At least one script name is required');
  await runPipeline(scripts);
}
