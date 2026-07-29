import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { describe, expect, it, vi } from 'vitest';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(repositoryRoot, 'tooling/validate-content/src/main.ts');

function run(args: readonly string[]) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('pnpm CLI path is unavailable in the test environment');
  return spawnSync(process.execPath, [pnpmCli, 'exec', 'tsx', cli, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
  });
}

function runJson(root: string) {
  return run([root, '--format', 'json']);
}

interface JsonDiagnostic {
  code?: unknown;
  location?: unknown;
}

function isJsonDiagnostic(value: unknown): value is JsonDiagnostic {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonDiagnostics(stdout: string): readonly JsonDiagnostic[] {
  const parsed: unknown = JSON.parse(stdout);
  if (!Array.isArray(parsed)) throw new Error('Expected a JSON diagnostic array');
  if (!parsed.every(isJsonDiagnostic)) {
    throw new Error('Expected every JSON diagnostic to be an object');
  }
  return parsed;
}

describe('validate-content CLI', () => {
  it('rejects non-object JSON diagnostic array elements', () => {
    expect(() => parseJsonDiagnostics('[null]')).toThrow(
      'Expected every JSON diagnostic to be an object',
    );
  });

  it('exits zero with empty JSON diagnostics for the valid minimal graph', () => {
    const result = runJson('fixtures/curriculum/valid/minimal');
    expect(result.status).toBe(0);
    expect(parseJsonDiagnostics(result.stdout)).toEqual([]);
    expect(result.stderr).toBe('');
  });

  it('exits zero for the canonical curriculum root', () => {
    const result = runJson('curriculum');
    expect(result.status).toBe(0);
    expect(parseJsonDiagnostics(result.stdout)).toEqual([]);
    expect(result.stderr).toBe('');
  });

  it.each([
    ['fixtures/curriculum/invalid/malformed-markdown', 'CURRICULUM_PARSE_001'],
    ['fixtures/curriculum/invalid/missing-reference', 'CURRICULUM_REFERENCE_001'],
    ['fixtures/curriculum/invalid/multi-node-cycle', 'CURRICULUM_GRAPH_003'],
  ])('fails closed for %s with JSON code %s on stdout', (fixture, code) => {
    const result = runJson(fixture);
    expect(result.status).toBe(1);
    expect(parseJsonDiagnostics(result.stdout).map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
    expect(result.stderr).toBe('');
  });

  it('prints actionable text diagnostics only on stderr', () => {
    const result = run(['fixtures/curriculum/invalid/missing-reference', '--format', 'text']);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('CURRICULUM_REFERENCE_001');
    expect(result.stderr).toContain('Expected:');
    expect(result.stderr).toContain('Remediation:');
  });

  it('is import-safe and registers no validation or output side effects', async () => {
    const originalExitCode = process.exitCode;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const imported = await import('../src/main.js');
      expect(imported.validateContent).toBeTypeOf('function');
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(originalExitCode);
    } finally {
      log.mockRestore();
      error.mockRestore();
      process.exitCode = originalExitCode;
    }
  });

  it('turns an unexpected dependency exception into VALIDATOR_INTERNAL_001', async () => {
    const { validateContent } = await import('../src/main.js');
    const outcome = await validateContent('curriculum', {
      load: () => Promise.reject(new Error('boom')),
      buildGraph: buildCurriculumGraph,
      validateGraph: validateCurriculumGraph,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.diagnostics[0]?.code).toBe('VALIDATOR_INTERNAL_001');
    expect(outcome.diagnostics[0]?.location.file).toBe('curriculum');
  });

  it('fails a malformed invocation as JSON on stdout with no stderr leakage', () => {
    const result = run(['curriculum', '--format', 'yaml']);
    expect(result.status).toBe(1);
    expect(parseJsonDiagnostics(result.stdout).map((diagnostic) => diagnostic.code)).toEqual([
      'VALIDATOR_INTERNAL_001',
    ]);
    expect(result.stderr).toBe('');
  });

  it('accepts the leading argument separator forwarded by the root pnpm script', async () => {
    const { parseArguments } = await import('../src/main.js');
    expect(parseArguments(['--', 'curriculum', '--format', 'json'])).toEqual({
      root: path.resolve(repositoryRoot, 'curriculum'),
      format: 'json',
    });
  });
});
