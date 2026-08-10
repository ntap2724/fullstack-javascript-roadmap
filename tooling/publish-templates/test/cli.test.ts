import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { parseArguments } from '../src/main.js';

const run = promisify(execFile);
const mainModule = fileURLToPath(new URL('../src/main.ts', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const required = [
  '--template',
  'templates/javascript-engineering',
  '--output',
  'out',
  '--source-repository',
  'fullstack-javascript-roadmap',
  '--source-commit',
  '0123456789abcdef0123456789abcdef01234567',
  '--generated-at',
  '2026-07-26T12:00:00.000Z',
  '--node-version',
  '24.0.0',
  '--pnpm-version',
  '11.0.0',
];

describe('parseArguments', () => {
  it('accepts a complete flag set and defaults json to false', () => {
    expect(parseArguments(required)).toEqual({
      templateRoot: 'templates/javascript-engineering',
      outputRoot: 'out',
      sourceRepository: 'fullstack-javascript-roadmap',
      sourceCommit: '0123456789abcdef0123456789abcdef01234567',
      generatedAt: '2026-07-26T12:00:00.000Z',
      nodeVersion: '24.0.0',
      pnpmVersion: '11.0.0',
      json: false,
    });
  });

  it('accepts the optional --json flag', () => {
    expect(parseArguments([...required, '--json']).json).toBe(true);
  });

  it.each([
    [[...required, '--bogus'], 'Unknown flag: --bogus'],
    [[...required, '--json', '--json'], 'Duplicate flag: --json'],
    [[...required, '--template', 'again'], 'Duplicate flag: --template'],
    [['--template'], 'Missing value for --template'],
    [['--template', '--output'], 'Missing value for --template'],
    [['--template', 'x'], 'Missing required flag: --output'],
    [[], 'Missing required flag: --template'],
  ])('rejects %j with its exact message', (argv, message) => {
    // Exact message equality, not a substring or a bare "throws": a parser that
    // rejected everything with one generic error would satisfy a looser assertion.
    //
    // `toThrow(new Error(msg))` compares the message by equality. The string form,
    // `toThrow(msg)`, is only a SUBSTRING check — measured, not assumed — so it
    // would still pass if the parser answered every bad flag set with a single
    // message that happened to contain this one as a prefix.
    expect(() => parseArguments(argv)).toThrow(new Error(message));
  });

  it('rejects a strict prefix of the real message, proving equality not substring', () => {
    // Measured, not assumed: `toThrow('Unknown flag')` PASSES against the real
    // message 'Unknown flag: --bogus' (substring), while
    // `toThrow(new Error('Unknown flag'))` FAILS on it (equality). This test asserts
    // the strict prefix is NOT accepted, so it fails if this call is weakened to the
    // string form.
    //
    // Scope, stated honestly: this locks THIS call only. It does not detect the
    // seven rows above being reverted to the string form — mutation-tested, and
    // that mutation passed. No row's message is a prefix of another (checked), so
    // substring and equality coincide for them against the current parser; the risk
    // is a FUTURE parser that answers with a longer message containing the old one.
    // The row-level guard against that is the equality matcher itself, not this test.
    expect(() => parseArguments([...required, '--bogus'])).not.toThrow(new Error('Unknown flag'));
    expect(() => parseArguments([...required, '--bogus'])).toThrow(
      new Error('Unknown flag: --bogus'),
    );
  });
});

describe('CLI module boundary', () => {
  // D1 regression. The plan's sketch ran its try block at module top level while
  // this test file imports parseArguments from the same module. Importing it then
  // executed the CLI against Vitest's own process.argv, threw, was caught, and set
  // process.exitCode = 2 in the worker — so a fully passing suite could still exit
  // non-zero. The import at the top of this file is itself the regression probe.
  it('does not execute the CLI on import', () => {
    expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
  });

  it('still runs and fails closed with exit 2 when invoked directly with a bad flag', async () => {
    await expect(
      run(process.execPath, [mainModule, '--bogus'], {
        cwd: repoRoot,
        env: { ...process.env, NODE_OPTIONS: '--import tsx' },
      }),
    ).rejects.toMatchObject({ code: 2 });
  }, 120_000);

  it('reports usage errors on stderr rather than silently exiting', async () => {
    // execFile resolves with {stdout, stderr} and rejects with an Error carrying
    // `code` and `stderr`. Narrowed via a guard so the union is handled honestly
    // instead of being asserted away, and so a RESOLVED run fails the test rather
    // than silently reading undefined off the success shape.
    const outcome = await run(process.execPath, [mainModule, '--bogus'], {
      cwd: repoRoot,
      env: { ...process.env, NODE_OPTIONS: '--import tsx' },
    }).then(
      () => ({ rejected: false as const }),
      (reason: unknown) => ({ rejected: true as const, reason }),
    );

    expect(outcome.rejected).toBe(true);
    if (!outcome.rejected) return;
    const failureDetail = outcome.reason;
    expect(typeof failureDetail).toBe('object');
    expect(failureDetail).not.toBeNull();
    if (typeof failureDetail !== 'object' || failureDetail === null) return;
    // Narrowed with `in` rather than an `as` cast: a cast asserts the shape without
    // checking it, so these assertions would keep passing if execFile stopped
    // attaching `code`/`stderr` to the rejection.
    expect('code' in failureDetail && 'stderr' in failureDetail).toBe(true);
    if (!('code' in failureDetail) || !('stderr' in failureDetail)) return;
    expect(failureDetail.code).toBe(2);
    expect(String(failureDetail.stderr)).toContain('Unknown flag: --bogus');
  }, 120_000);
});
