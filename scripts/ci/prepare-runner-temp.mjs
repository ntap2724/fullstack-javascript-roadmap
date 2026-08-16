#!/usr/bin/env node

/**
 * prepare-runner-temp.mjs
 *
 * Creates a canonical execution root with no reparse ancestors.
 * On Windows GitHub Actions runners, os.tmpdir() returns a path with junctions
 * in its ancestry. This script creates a canonical temp directory at a
 * junction-free path and sets TEMP/TMP to point to it.
 *
 * Usage: node scripts/ci/prepare-runner-temp.mjs
 *
 * Environment variables set:
 *   TEMP - canonical temp directory
 *   TMP  - canonical temp directory
 *   TMPDIR - canonical temp directory (Unix convention)
 */

import { mkdir, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const CANONICAL_TEMP_NAME = 'ci-canonical-temp';

async function isPathCanonical(targetPath) {
  try {
    const lexical = path.resolve(targetPath);
    const canonical = await realpath(lexical);
    return lexical.toLowerCase() === canonical.toLowerCase();
  } catch {
    return false;
  }
}

async function findCanonicalRoot() {
  // Strategy: try several candidate roots and pick the first one that is canonical
  const candidates = [
    path.join(homedir(), CANONICAL_TEMP_NAME),
    'C:\\ci-canonical-temp',
    path.join(process.env.GITHUB_WORKSPACE || '.', '..', CANONICAL_TEMP_NAME),
  ];

  for (const candidate of candidates) {
    try {
      await mkdir(candidate, { recursive: true });
      if (await isPathCanonical(candidate)) {
        return candidate;
      }
    } catch {
      // Continue to next candidate
    }
  }

  throw new Error('Could not find a canonical root path (all candidates have reparse ancestors)');
}

async function main() {
  if (process.platform !== 'win32') {
    // On non-Windows, the default temp is already canonical
    console.log('Non-Windows platform, skipping canonical temp preparation');
    process.exit(0);
  }

  console.log('Preparing canonical execution root for Windows...');

  const canonicalRoot = await findCanonicalRoot();
  console.log(`Canonical root: ${canonicalRoot}`);

  // Verify it's actually canonical
  if (!(await isPathCanonical(canonicalRoot))) {
    throw new Error(`Canonical root is not actually canonical: ${canonicalRoot}`);
  }

  // Create subdirectories
  const canonicalTemp = path.join(canonicalRoot, 'tmp');
  const canonicalCache = path.join(canonicalRoot, 'cache');
  await mkdir(canonicalTemp, { recursive: true });
  await mkdir(canonicalCache, { recursive: true });

  // Verify subdirectories are canonical
  if (!(await isPathCanonical(canonicalTemp))) {
    throw new Error(`Canonical temp is not actually canonical: ${canonicalTemp}`);
  }

  console.log(`Canonical temp: ${canonicalTemp}`);
  console.log(`Canonical cache: ${canonicalCache}`);

  // Write GitHub Actions environment files if running in Actions
  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    const { appendFile } = await import('node:fs/promises');
    const envEntries = [
      `TEMP=${canonicalTemp}`,
      `TMP=${canonicalTemp}`,
      `TMPDIR=${canonicalTemp}`,
      `NPM_CONFIG_CACHE=${canonicalCache}`,
    ];
    await appendFile(githubEnv, envEntries.join('\n') + '\n', 'utf8');
    console.log('Wrote environment variables to GITHUB_ENV');
  } else {
    // For local testing, just print the values
    console.log('Not running in GitHub Actions (GITHUB_ENV not set)');
    console.log('Set these environment variables manually:');
    console.log(`  TEMP=${canonicalTemp}`);
    console.log(`  TMP=${canonicalTemp}`);
    console.log(`  TMPDIR=${canonicalTemp}`);
  }

  console.log('Canonical execution root prepared successfully');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
