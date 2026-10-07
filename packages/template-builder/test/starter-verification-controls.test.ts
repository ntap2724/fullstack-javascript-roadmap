import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Contract tests for the verification controls the starter publishes.
 *
 * These are the controls a learner or an assistant would have to defeat to make a
 * repository read green without doing the work: the aggregate learner runner, and
 * the root scripts that decide what `verify` actually verifies. They are pinned
 * here — inside `pnpm test`, which runs on every pull request — rather than only
 * inside `pnpm verify:templates`, which does not.
 *
 * The subject is the template source. Materialization copies `files/**` verbatim,
 * and `assertVerificationControlsShipVerbatim` in
 * scripts/verify-template-learner-contract.ts proves that the runner, the root
 * manifest, and the workflow reach the generated repository byte-for-byte, so
 * asserting the contract once here is enough.
 */

const starterRoot = fileURLToPath(
  new URL('../../../templates/fullstack-vertical-slice/files/', import.meta.url),
);
const runnerPath = path.join(starterRoot, 'scripts', 'verify-learner.mjs');

describe('learner runner subprocess limits', () => {
  /** Isolates the option object handed to the runner's single spawnSync call. */
  async function spawnCallSource(): Promise<string> {
    const source = await readFile(runnerPath, 'utf8');
    expect(
      source.split('spawnSync(').length - 1,
      'the runner must contain exactly one spawnSync call',
    ).toBe(1);
    const start = source.indexOf('spawnSync(');
    // The call is `return spawnSync(cmd, args, { ... });` inside a two-space-indented
    // function, so its terminator is `\n  });`. Anchoring on `\n  );` instead matched
    // an unrelated statement far below and let the window swallow most of the file —
    // which made every assertion in this block satisfiable from a comment.
    const end = source.indexOf('\n  });', start);
    expect(end, 'the spawnSync call must be terminated').toBeGreaterThan(start);
    const call = source.slice(start, end);
    expect(
      call.split('\n').length,
      'the isolated window must be the call itself, not the rest of the file',
    ).toBeLessThan(15);
    return call;
  }

  it('bounds every suite in time and in output', async () => {
    const call = await spawnCallSource();

    expect(call).toContain('timeout: SUITE_TIMEOUT_MS,');
    expect(call).toContain('maxBuffer: SUITE_MAX_BUFFER_BYTES,');
  });

  it('declares limits large enough for real suites and small enough to bound', async () => {
    const source = await readFile(runnerPath, 'utf8');

    expect(source).toContain('const SUITE_TIMEOUT_MS = 300_000;');
    expect(source).toContain('const SUITE_MAX_BUFFER_BYTES = 16_777_216;');
  });

  it('keeps shell-free argv execution while bounded', async () => {
    const call = await spawnCallSource();

    expect(call).toContain('shell: false,');
    expect(call).toContain('process.execPath,');
    expect(call).toContain('[pnpmExecPath, ...args],');
  });

  it('locates each suite and refuses to let pnpm succeed on no match', async () => {
    const source = await readFile(runnerPath, 'utf8');

    // `pnpm --filter <unmatched>` exits 0, so the runner must not infer success
    // from an exit status alone. It asks pnpm which projects matched, checks the
    // matched project still declares the script and still contains the suite file,
    // passes --fail-if-no-match so the run cannot come back green empty, and passes
    // --passWithNoTests=false so a suite config cannot turn "no tests" into success.
    expect(source).toContain("['--filter', suite.filter, 'list', '--depth=-1', '--json']");
    expect(source).toContain("'--fail-if-no-match',");
    expect(source).toContain("'--passWithNoTests=false',");
    expect(source).toContain('declares no test:learner script');
    expect(source).toContain('no longer contains');
    expect(source).toContain('LEARNER_RUNNER_003');
    expect(source).not.toContain('declaredDiagnostic');
    expect(source).toContain('console.log(`\\n=== learner contract: ${suite.name} ===`);');
    expect(source).not.toContain('LEARNER_API_ENROLLMENT_001)');
    expect(source).not.toContain('LEARNER_WEB_ENROLLMENT_001)');
  });
});

async function starterScripts(): Promise<Record<string, string>> {
  const parsed: unknown = JSON.parse(
    await readFile(path.join(starterRoot, 'package.json'), 'utf8'),
  );
  if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
    throw new Error('the starter manifest must declare a scripts block');
  }
  const { scripts } = parsed;
  if (typeof scripts !== 'object' || scripts === null) {
    throw new Error('the starter scripts block must be an object');
  }
  const entries = Object.entries(scripts).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  return Object.fromEntries(entries);
}

function declared(scripts: Record<string, string>, name: string): string {
  const value = scripts[name];
  if (value === undefined) throw new Error(`the starter must declare a ${name} script`);
  return value;
}

/**
 * Every declared script must be a `&&`-joined sequence of plain commands.
 *
 * This is an allowlist, not a search for bad operators. Blacklisting kept losing:
 * `|| true`, then `| cat`, then `; true`, then a bare `&`, then `! pnpm
 * test:learner`, then a second line after a newline. POSIX `sh` returns 0 for the
 * last two, so a red learner contract would read as success on the starter's own
 * ubuntu runner. Enumerating shell syntax that swallows an exit status is a losing
 * game; permitting only what the starter actually needs is not.
 */
const safeCommandSegment = /^[\w@./:=-]+(?: [\w@./:=-]+)*$/;

function shellUnsafeSegment(command: string): string | null {
  for (const segment of command.split('&&')) {
    const trimmed = segment.trim();
    if (trimmed.length === 0 || !safeCommandSegment.test(trimmed)) return segment;
  }
  return null;
}

describe('generated starter verification scripts', () => {
  it('keeps verify:baseline as the health check and nothing more', async () => {
    const baseline = declared(await starterScripts(), 'verify:baseline');

    expect(baseline).toContain('pnpm check');
    expect(baseline).toContain('pnpm test:infrastructure');
    expect(baseline).toContain('pnpm build');
    // The publication gate runs this command. If it ever reached the learner
    // contract, publication would require shipping a completed solution.
    expect(baseline).not.toContain('test:learner');
    expect(baseline).not.toContain('verify-learner');
  });

  it('routes the learner contract through the aggregate runner', async () => {
    expect(declared(await starterScripts(), 'test:learner')).toBe(
      'node scripts/verify-learner.mjs',
    );
  });

  it('makes verify the baseline followed by the learner contract', async () => {
    const verify = declared(await starterScripts(), 'verify');

    expect(verify).toContain('verify:baseline');
    expect(verify).toContain('test:learner');
    expect(verify.indexOf('verify:baseline')).toBeLessThan(verify.indexOf('test:learner'));
    // `&&` is what makes the learner result decide the command's exit status.
    expect(verify).toContain('&&');
    expect(shellUnsafeSegment(verify)).toBeNull();
  });

  it('never tolerates a non-zero exit in any declared script', async () => {
    for (const [name, command] of Object.entries(await starterScripts())) {
      // Same allowlist as `verify`, applied to every script. `verify:baseline` is
      // the publication gate and the CI baseline job, so a tolerated failure there
      // is as damaging as one in `verify`.
      expect(shellUnsafeSegment(command), name).toBeNull();
    }
  });

  it('keeps test covering the infrastructure and learner suites', async () => {
    const test = declared(await starterScripts(), 'test');

    expect(test).toContain('test:infrastructure');
    expect(test).toContain('test:learner');
  });

  /**
   * The root `test:learner` is only as strong as the per-app scripts it fans out
   * to. Repointing `apps/web`'s at the infrastructure suite would silently delete
   * half the learner contract while every root-level check still passed.
   */
  it.each([
    ['apps/api', 'test/learner.test.ts'],
    ['apps/web', 'test/learner.test.tsx'],
  ])('routes %s test:learner at its own learner suite', async (packageDirectory, suiteFile) => {
    const parsed: unknown = JSON.parse(
      await readFile(path.join(starterRoot, packageDirectory, 'package.json'), 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null || !('scripts' in parsed)) {
      throw new Error(`${packageDirectory} must declare a scripts block`);
    }
    const { scripts } = parsed;
    if (typeof scripts !== 'object' || scripts === null || !('test:learner' in scripts)) {
      throw new Error(`${packageDirectory} must declare a test:learner script`);
    }
    const command = scripts['test:learner'];

    expect(command).toBe(`vitest run --config vitest.config.ts ${suiteFile}`);
  });

  /**
   * A suite config decides which files the runner collects, so it can neutralise a
   * learner contract without touching a single pinned string: set
   * `passWithNoTests: true`, narrow `include` or widen `exclude` past the learner
   * suite, and "no test files found" becomes success.
   */
  it.each(['api', 'web'])('keeps the %s suite collectable', async (app) => {
    const config = await readFile(path.join(starterRoot, 'apps', app, 'vitest.config.ts'), 'utf8');

    expect(config).not.toContain('passWithNoTests');
    expect(config).not.toContain('include');
    expect(config).not.toContain('exclude');
  });

  /**
   * The learner suites are reached by package name, so the workspace globs decide
   * whether they can be found at all. Narrowing them is the quietest way to make
   * the runner unable to locate a suite, so the globs are pinned rather than merely
   * documented as protected.
   */
  it('does not emit learner diagnostics before a learner assertion fails', async () => {
    const runner = await readFile(runnerPath, 'utf8');
    const apiLearner = await readFile(
      path.join(starterRoot, 'apps', 'api', 'test', 'learner.test.ts'),
      'utf8',
    );
    const webLearner = await readFile(
      path.join(starterRoot, 'apps', 'web', 'test', 'learner.test.tsx'),
      'utf8',
    );

    expect(runner).not.toContain('LEARNER_API_ENROLLMENT_001');
    expect(runner).not.toContain('LEARNER_WEB_ENROLLMENT_001');
    expect(apiLearner).toContain("expect(response.status, 'LEARNER_API_ENROLLMENT_001')");
    expect(apiLearner).not.toContain("it('LEARNER_API_ENROLLMENT_001");
    expect(webLearner).toContain("expect(button, 'LEARNER_WEB_ENROLLMENT_001')");
    expect(webLearner).not.toContain("it('LEARNER_WEB_ENROLLMENT_001");
  });

  it('keeps the workspace globs that make the learner suites reachable', async () => {
    const workspace: unknown = parse(
      await readFile(path.join(starterRoot, 'pnpm-workspace.yaml'), 'utf8'),
    );
    if (typeof workspace !== 'object' || workspace === null || !('packages' in workspace)) {
      throw new Error('the starter workspace must declare packages');
    }

    expect(workspace.packages).toEqual(['apps/*', 'packages/*']);
  });
});
