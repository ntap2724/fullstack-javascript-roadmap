import { execFile } from 'node:child_process';
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolvePnpmInvocation } from './read-toolchain.mjs';

const execFileAsync = promisify(execFile);

function invocationFor(fixture) {
  if (fixture.command === 'pnpm') return resolvePnpmInvocation(['--silent', ...fixture.args]);
  return { command: fixture.command, args: fixture.args };
}

function extractFirstJson(text) {
  const start = text.indexOf('[');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth += 1;
    if (ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function diagnosticCodes(...outputs) {
  const values = [];
  for (const output of outputs) {
    const trimmed = output.trim();
    if (!trimmed) continue;
    try {
      values.push(JSON.parse(trimmed));
      continue;
    } catch {
      /* Full parse failed — extract first complete JSON array. */
      const json = extractFirstJson(trimmed);
      if (json) {
        try {
          values.push(JSON.parse(json));
          continue;
        } catch {
          /* extracted JSON also failed */
        }
      }
      for (const line of trimmed.split(/\r?\n/)) {
        try {
          values.push(JSON.parse(line));
        } catch {
          /* non-JSON process text */
        }
      }
    }
  }
  const codes = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    if (typeof value.code === 'string') codes.add(value.code);
    Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return codes;
}

function isSameOrWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

function cleanupEscapeError(fixture) {
  return new Error(`Negative fixture ${fixture.id} cleanup target escapes fixture root`);
}

async function nearestExistingCanonicalPath(target, root) {
  let candidate = target;
  while (true) {
    try {
      return await realpath(candidate);
    } catch (error) {
      if (error?.code !== 'ENOENT' || candidate === root) throw error;
      candidate = path.dirname(candidate);
    }
  }
}

async function resolveCleanupTarget(fixture, root) {
  if (path.isAbsolute(fixture.cleanup)) throw cleanupEscapeError(fixture);

  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, fixture.cleanup);
  if (target === resolvedRoot || !isSameOrWithin(resolvedRoot, target)) {
    throw cleanupEscapeError(fixture);
  }

  const canonicalRoot = await realpath(resolvedRoot);
  const canonicalTarget = await nearestExistingCanonicalPath(target, resolvedRoot);
  if (!isSameOrWithin(canonicalRoot, canonicalTarget)) throw cleanupEscapeError(fixture);
  return target;
}

export async function runNegativeFixture(fixture, root) {
  if (fixture.cleanup) {
    await rm(await resolveCleanupTarget(fixture, root), {
      recursive: true,
      force: true,
    });
  }
  const invocation = invocationFor(fixture);
  try {
    await execFileAsync(invocation.command, invocation.args, {
      cwd: root,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    throw new Error(`Negative fixture ${fixture.id} unexpectedly passed`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('unexpectedly passed')) throw error;
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const codes = diagnosticCodes(stdout, stderr);
    if (!codes.has(fixture.expectedDiagnostic)) {
      throw new Error(
        `Negative fixture ${fixture.id} failed without ${fixture.expectedDiagnostic}`,
        { cause: error },
      );
    }
    return {
      id: fixture.id,
      status: 'passed',
      expectedDiagnostic: fixture.expectedDiagnostic,
    };
  }
}

export async function runNegativeFixtureManifest(root = process.cwd()) {
  const fixtures = JSON.parse(
    await readFile(path.join(root, 'fixtures/expected-failures.json'), 'utf8'),
  );
  const results = [];
  for (const fixture of fixtures) results.push(await runNegativeFixture(fixture, root));
  const report = {
    schemaVersion: 1,
    status: 'passed',
    sourceCommit: process.env.GITHUB_SHA ?? '0000000000000000000000000000000000000000',
    results,
  };
  const reportPath = path.join(root, '.tmp/reports/negative-fixtures/report.json');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runNegativeFixtureManifest()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
