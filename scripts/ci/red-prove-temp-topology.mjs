#!/usr/bin/env node

/**
 * RED PROVE: Shows that the current Windows runner topology fails.
 *
 * This script demonstrates that os.tmpdir() on the GitHub Actions Windows runner
 * contains reparse points (junctions) in the path ancestry, which causes
 * exercise-runner security checks and Astro fs-event watchers to fail.
 *
 * Exit code 1 = RED (failure confirmed)
 * Exit code 0 = GREEN (canonical root passes)
 */

import { lstat, realpath, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function comparable(value) {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isReparseAlias(lexical, canonical) {
  return comparable(lexical) !== comparable(canonical);
}

async function checkPathAncestry(label, targetPath) {
  console.log(`\n=== ${label} ===`);
  console.log(`Target: ${targetPath}`);

  let cursor = path.resolve(targetPath);
  const results = [];

  while (cursor.length > 0) {
    try {
      const information = await lstat(cursor);
      let canonical;
      try {
        canonical = await realpath(cursor);
      } catch {
        canonical = '(error)';
      }
      const isAlias = isReparseAlias(cursor, canonical);
      const isSymlink = information.isSymbolicLink();
      const isReparse = isSymlink || isAlias;

      results.push({
        lexical: cursor,
        canonical,
        isSymlink,
        isAlias,
        isReparse,
      });

      console.log(`  ${cursor}`);
      console.log(`    canonical: ${canonical}`);
      console.log(`    isSymbolicLink: ${isSymlink}`);
      console.log(`    isAlias: ${isAlias}`);
      if (isReparse) {
        console.log(`    *** REPARSE/ALIAS FOUND ***`);
      }
    } catch (e) {
      console.log(`  ${cursor} (error: ${e.code})`);
    }

    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return results;
}

async function main() {
  console.log('=== RED PROVE: Current Windows runner topology ===');
  console.log(`Platform: ${process.platform}`);
  console.log(`os.tmpdir(): ${tmpdir()}`);

  // Check temp directory ancestry
  const tempResults = await checkPathAncestry('Temp directory ancestry', tmpdir());
  const hasReparse = tempResults.some((r) => r.isReparse);

  // Check workspace ancestry
  const workspaceResults = await checkPathAncestry('Workspace ancestry', process.cwd());
  const workspaceHasReparse = workspaceResults.some((r) => r.isReparse);

  // Try to create a temp directory and check its ancestry
  let testDir;
  try {
    testDir = await mkdtemp(path.join(tmpdir(), 'red-prove-'));
    const testResults = await checkPathAncestry('Test temp directory ancestry', testDir);
    const testHasReparse = testResults.some((r) => r.isReparse);

    console.log('\n=== SUMMARY ===');
    console.log(`Temp directory has reparse ancestor: ${hasReparse}`);
    console.log(`Workspace has reparse ancestor: ${workspaceHasReparse}`);
    console.log(`Test temp directory has reparse ancestor: ${testHasReparse}`);

    if (hasReparse || testHasReparse) {
      console.log('\nRED: Current topology fails - reparse points found in temp path ancestry');
      console.log('This confirms WP09-HOSTED-WINDOWS-01 and WP09-HOSTED-WINDOWS-02 root cause.');
      process.exit(1);
    } else {
      console.log('\nNo reparse points found in current topology.');
      console.log('This machine does not reproduce the runner issue.');
      process.exit(0);
    }
  } finally {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(2);
});
