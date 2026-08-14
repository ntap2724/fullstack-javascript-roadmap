import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readToolchain, resolvePnpmInvocation } from './read-toolchain.mjs';

const execFileAsync = promisify(execFile);

export async function verifyEnvironment(root = process.cwd()) {
  const expected = await readToolchain(root);
  const invocation = resolvePnpmInvocation(['--version']);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: root,
    windowsHide: true,
  });
  const observed = { node: process.versions.node, pnpm: stdout.trim() };
  if (observed.node !== expected.node || observed.pnpm !== expected.pnpm) {
    throw new Error(
      `Toolchain mismatch: expected Node ${expected.node} / pnpm ${expected.pnpm}, observed Node ${observed.node} / pnpm ${observed.pnpm}`,
    );
  }
  return { expected, observed };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await verifyEnvironment(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
