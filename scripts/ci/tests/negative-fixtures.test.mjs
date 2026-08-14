import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNegativeFixture } from '../run-negative-fixtures.mjs';

const expectedDiagnostic = 'EXPECTED_001';

function cleanupFixture(id, cleanup) {
  return {
    id,
    cleanup,
    command: process.execPath,
    args: [
      '--input-type=module',
      '--eval',
      `console.log(JSON.stringify({diagnostics:[{code:'${expectedDiagnostic}'}]})); process.exit(1)`,
    ],
    expectedDiagnostic,
  };
}

async function scratchRoot(t, label) {
  const scratch = await mkdtemp(path.join(tmpdir(), `roadmap-negative-${label}-`));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });
  const root = path.join(scratch, 'root');
  await mkdir(root, { recursive: true });
  return { scratch, root };
}

async function settle(promise) {
  try {
    return { state: 'fulfilled', value: await promise };
  } catch (error) {
    return { state: 'rejected', error };
  }
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function readIfPresent(target) {
  try {
    return await readFile(target, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function summarizedOutcome(outcome) {
  return {
    fixtureOutcome: outcome.state,
    fixtureResultStatus: outcome.state === 'fulfilled' ? outcome.value.status : null,
  };
}

test('accepts a non-zero process with the exact declared diagnostic', async () => {
  const result = await runNegativeFixture(
    {
      id: 'expected',
      command: process.execPath,
      args: [
        '--input-type=module',
        '--eval',
        "console.log(JSON.stringify({diagnostics:[{code:'EXPECTED_001'}]})); process.exit(1)",
      ],
      expectedDiagnostic: 'EXPECTED_001',
    },
    process.cwd(),
  );
  assert.equal(result.status, 'passed');
});

test('rejects a fixture that exits zero', async () => {
  await assert.rejects(
    () =>
      runNegativeFixture(
        {
          id: 'false-pass',
          command: process.execPath,
          args: ['--eval', 'process.exit(0)'],
          expectedDiagnostic: 'EXPECTED_001',
        },
        process.cwd(),
      ),
    /unexpectedly passed/,
  );
});

test('rejects a non-zero process that emits a different diagnostic', async () => {
  await assert.rejects(
    () =>
      runNegativeFixture(
        {
          id: 'wrong-code',
          command: process.execPath,
          args: [
            '--input-type=module',
            '--eval',
            "console.log(JSON.stringify({diagnostics:[{code:'OTHER_001'}]})); process.exit(1)",
          ],
          expectedDiagnostic: 'EXPECTED_001',
        },
        process.cwd(),
      ),
    /without EXPECTED_001/,
  );
});

test('rejects lexical cleanup escape without deleting the outside victim', async (t) => {
  const { scratch, root } = await scratchRoot(t, 'lexical');
  const victim = path.join(scratch, 'victim');
  const sentinel = path.join(victim, 'sentinel.txt');
  await mkdir(victim);
  await writeFile(sentinel, 'lexical-victim-sentinel\n');

  const outcome = await settle(
    runNegativeFixture(cleanupFixture('lexical-escape', '../victim'), root),
  );

  assert.deepEqual(
    {
      ...summarizedOutcome(outcome),
      victimExists: await exists(victim),
      sentinelBytes: await readIfPresent(sentinel),
    },
    {
      fixtureOutcome: 'rejected',
      fixtureResultStatus: null,
      victimExists: true,
      sentinelBytes: 'lexical-victim-sentinel\n',
    },
  );
});

test('rejects absolute cleanup escape without deleting the outside target', async (t) => {
  const { scratch, root } = await scratchRoot(t, 'absolute');
  const outsideTarget = path.join(scratch, 'absolute-victim.txt');
  await writeFile(outsideTarget, 'absolute-victim-sentinel\n');
  assert.equal(path.isAbsolute(outsideTarget), true);

  const outcome = await settle(
    runNegativeFixture(cleanupFixture('absolute-escape', outsideTarget), root),
  );

  assert.deepEqual(
    {
      ...summarizedOutcome(outcome),
      targetExists: await exists(outsideTarget),
      targetBytes: await readIfPresent(outsideTarget),
    },
    {
      fixtureOutcome: 'rejected',
      fixtureResultStatus: null,
      targetExists: true,
      targetBytes: 'absolute-victim-sentinel\n',
    },
  );
});

test('rejects ancestor-link cleanup escape without deleting the outside victim', async (t) => {
  const { scratch, root } = await scratchRoot(t, 'ancestor-link');
  const outsideDirectory = path.join(scratch, 'outside-directory');
  const outsideVictim = path.join(outsideDirectory, 'victim.txt');
  const linkedAncestor = path.join(root, 'linked-outside');
  await mkdir(outsideDirectory);
  await writeFile(outsideVictim, 'ancestor-link-victim-sentinel\n');
  await symlink(
    outsideDirectory,
    linkedAncestor,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  assert.equal((await lstat(linkedAncestor)).isSymbolicLink(), true);
  assert.equal(await realpath(linkedAncestor), await realpath(outsideDirectory));
  assert.equal((await lstat(outsideVictim)).isFile(), true);

  const outcome = await settle(
    runNegativeFixture(
      cleanupFixture('ancestor-link-escape', path.join('linked-outside', 'victim.txt')),
      root,
    ),
  );

  assert.deepEqual(
    {
      ...summarizedOutcome(outcome),
      victimExists: await exists(outsideVictim),
      victimBytes: await readIfPresent(outsideVictim),
    },
    {
      fixtureOutcome: 'rejected',
      fixtureResultStatus: null,
      victimExists: true,
      victimBytes: 'ancestor-link-victim-sentinel\n',
    },
  );
});

test('does not follow a final-component cleanup link to its outside target', async (t) => {
  const { scratch, root } = await scratchRoot(t, 'final-link');
  const outsideTarget = path.join(scratch, 'outside-target');
  const outsideSentinel = path.join(outsideTarget, 'sentinel.txt');
  const finalLink = path.join(root, 'outside-link');
  await mkdir(outsideTarget);
  await writeFile(outsideSentinel, 'final-link-target-sentinel\n');
  await symlink(outsideTarget, finalLink, process.platform === 'win32' ? 'junction' : 'dir');

  assert.equal((await lstat(finalLink)).isSymbolicLink(), true);
  assert.equal(await realpath(finalLink), await realpath(outsideTarget));
  assert.equal((await lstat(outsideSentinel)).isFile(), true);

  await settle(runNegativeFixture(cleanupFixture('final-link', 'outside-link'), root));

  assert.deepEqual(
    {
      targetExists: await exists(outsideTarget),
      sentinelBytes: await readIfPresent(outsideSentinel),
    },
    {
      targetExists: true,
      sentinelBytes: 'final-link-target-sentinel\n',
    },
  );
});

test('removes an ordinary in-root cleanup target without modifying its sibling', async (t) => {
  const { root } = await scratchRoot(t, 'ordinary');
  const cleanupTarget = path.join(root, 'cleanup-target');
  const sibling = path.join(root, 'sibling.txt');
  await mkdir(cleanupTarget);
  await writeFile(path.join(cleanupTarget, 'generated.txt'), 'remove me\n');
  await writeFile(sibling, 'sibling-sentinel\n');

  const result = await runNegativeFixture(
    cleanupFixture('ordinary-in-root', 'cleanup-target'),
    root,
  );

  assert.deepEqual(result, {
    id: 'ordinary-in-root',
    status: 'passed',
    expectedDiagnostic,
  });
  assert.equal(await exists(cleanupTarget), false);
  assert.equal(await readFile(sibling, 'utf8'), 'sibling-sentinel\n');
});

test('treats a missing ordinary in-root cleanup target as a safe no-op', async (t) => {
  const { root } = await scratchRoot(t, 'missing');
  const missingTarget = path.join(root, 'already-missing');
  const sibling = path.join(root, 'sibling.txt');
  await writeFile(sibling, 'missing-case-sibling-sentinel\n');
  assert.equal(await exists(missingTarget), false);

  const result = await runNegativeFixture(
    cleanupFixture('missing-in-root', 'already-missing'),
    root,
  );

  assert.deepEqual(result, {
    id: 'missing-in-root',
    status: 'passed',
    expectedDiagnostic,
  });
  assert.equal(await exists(missingTarget), false);
  assert.equal(await readFile(sibling, 'utf8'), 'missing-case-sibling-sentinel\n');
});
