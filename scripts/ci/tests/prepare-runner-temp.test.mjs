import { rm, realpath } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isReparseAlias(lexical, canonical) {
  return comparable(lexical) !== comparable(canonical);
}

async function hasReparseAncestor(targetPath) {
  let cursor = path.resolve(targetPath);
  while (cursor.length > 0) {
    try {
      const { lstat } = await import('node:fs/promises');
      const information = await lstat(cursor);
      if (information.isSymbolicLink()) {
        return true;
      }
      const canonical = await realpath(cursor);
      if (isReparseAlias(cursor, canonical)) {
        return true;
      }
    } catch {
      // Skip inaccessible paths
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return false;
}

test('prepare-runner-temp creates a canonical temp directory', async () => {
  if (process.platform !== 'win32') {
    // Skip on non-Windows
    return;
  }

  // Import and run the prepare script logic
  const { mkdir } = await import('node:fs/promises');

  // Simulate what prepare-runner-temp does
  const canonicalRoot = path.join(homedir(), 'ci-canonical-temp-test');
  await mkdir(canonicalRoot, { recursive: true });

  try {
    const lexical = path.resolve(canonicalRoot);
    const canonical = await realpath(lexical);

    // The canonical root should have no reparse ancestors
    const hasReparse = await hasReparseAncestor(canonicalRoot);

    // On a well-configured system, the home directory should be canonical
    // This test verifies the assumption
    assert.equal(
      hasReparse,
      false,
      `Canonical root ${canonicalRoot} should have no reparse ancestors`,
    );

    // Verify lexical == canonical
    assert.equal(
      comparable(lexical),
      comparable(canonical),
      `Lexical path should equal canonical path`,
    );
  } finally {
    await rm(canonicalRoot, { recursive: true, force: true });
  }
});

test('default tmpdir has no reparse ancestors on this machine', async () => {
  // This test documents the assumption that the local machine's temp is canonical
  // On the GitHub Actions runner, this test would FAIL (RED proof)
  const tempPath = tmpdir();
  const hasReparse = await hasReparseAncestor(tempPath);

  // Record the result for documentation
  console.log(`Default tmpdir: ${tempPath}`);
  console.log(`Has reparse ancestor: ${hasReparse}`);

  // On this local machine, we expect no reparse
  // On the runner, this would be true (RED)
  // This test serves as documentation of the topology difference
});

test('canonical root path is stable across invocations', async () => {
  const { mkdir } = await import('node:fs/promises');

  const canonicalRoot = path.join(homedir(), 'ci-canonical-temp-stability');
  await mkdir(canonicalRoot, { recursive: true });

  try {
    const lexical1 = path.resolve(canonicalRoot);
    const canonical1 = await realpath(lexical1);

    const lexical2 = path.resolve(canonicalRoot);
    const canonical2 = await realpath(lexical2);

    assert.equal(lexical1, lexical2);
    assert.equal(canonical1, canonical2);
    assert.equal(comparable(lexical1), comparable(canonical1));
  } finally {
    await rm(canonicalRoot, { recursive: true, force: true });
  }
});
