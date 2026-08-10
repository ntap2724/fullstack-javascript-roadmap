import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTemplateDryRun } from './pipeline.js';

const valueFlags = [
  '--template',
  '--output',
  '--source-repository',
  '--source-commit',
  '--generated-at',
  '--node-version',
  '--pnpm-version',
] as const;

type ValueFlag = (typeof valueFlags)[number];

const valueFlagSet: ReadonlySet<string> = new Set(valueFlags);

function isValueFlag(candidate: string): candidate is ValueFlag {
  return valueFlagSet.has(candidate);
}

/**
 * Reads a required flag. Returns the value or throws, so callers never need a
 * non-null assertion: the repository sets `@typescript-eslint/no-non-null-assertion`
 * to error, and `noUncheckedIndexedAccess` makes every lookup possibly-undefined.
 * The plan's sketch used `values.get(flag)!` and could not pass `pnpm lint` (D2).
 */
function requireFlag(values: ReadonlyMap<ValueFlag, string>, flag: ValueFlag): string {
  const value = values.get(flag);
  if (value === undefined) throw new Error(`Missing required flag: ${flag}`);
  return value;
}

export interface ParsedArguments {
  templateRoot: string;
  outputRoot: string;
  sourceRepository: string;
  sourceCommit: string;
  generatedAt: string;
  nodeVersion: string;
  pnpmVersion: string;
  json: boolean;
}

export function parseArguments(argv: readonly string[]): ParsedArguments {
  const values = new Map<ValueFlag, string>();
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined) break;
    if (flag === '--json') {
      if (json) throw new Error('Duplicate flag: --json');
      json = true;
      continue;
    }
    if (!isValueFlag(flag)) throw new Error(`Unknown flag: ${flag}`);
    if (values.has(flag)) throw new Error(`Duplicate flag: ${flag}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    values.set(flag, value);
    index += 1;
  }

  return {
    templateRoot: requireFlag(values, '--template'),
    outputRoot: requireFlag(values, '--output'),
    sourceRepository: requireFlag(values, '--source-repository'),
    sourceCommit: requireFlag(values, '--source-commit'),
    generatedAt: requireFlag(values, '--generated-at'),
    nodeVersion: requireFlag(values, '--node-version'),
    pnpmVersion: requireFlag(values, '--pnpm-version'),
    json,
  };
}

export async function main(argv: readonly string[]): Promise<number> {
  try {
    const { json, ...options } = parseArguments(argv);
    const report = await runTemplateDryRun(options);
    console.log(json ? JSON.stringify(report) : report);
    return report.status === 'passed' ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

// Invoked-as-main guard, matching the precedent in scripts/run-pipeline.mjs.
//
// D1: the plan's sketch ran this block at module top level, but test/cli.test.ts
// imports parseArguments from this same module. Importing it would execute the CLI
// against Vitest's own process.argv, throw on an unknown flag, be caught here, and
// set process.exitCode = 2 inside the worker — so a suite whose assertions all
// passed could still exit non-zero. The guard keeps import side-effect free while
// direct invocation behaves identically.
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
