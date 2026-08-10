import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { failure } from '@roadmap/validation-core';
import { runTemplateDryRun, type TemplateDryRunDependencies } from '../src/pipeline.js';

// Resolved from this file, never from process.cwd(). A root `vitest run` and a
// `pnpm --filter` run use different working directories, so a cwd-relative
// template root would silently point at nothing and these assertions would pass
// against a pipeline that never opened the real template (D3).
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const javascriptEngineering = path.join(repoRoot, 'templates', 'javascript-engineering');

/**
 * Runtime narrowing for the TEMPLATE_FILESET_001 `observed` payload. A type guard
 * rather than an `as` cast: a cast asserts the shape without checking it, so the
 * assertions below would keep passing if `observed` silently changed shape.
 */
function isFileSetObservation(
  value: unknown,
): value is { actual: readonly string[]; expected: readonly string[] } {
  if (typeof value !== 'object' || value === null) return false;
  if (!('actual' in value) || !('expected' in value)) return false;
  const { actual, expected } = value;
  return (
    Array.isArray(actual) &&
    actual.every((entry: unknown) => typeof entry === 'string') &&
    Array.isArray(expected) &&
    expected.every((entry: unknown) => typeof entry === 'string')
  );
}

const options = async () => ({
  templateRoot: javascriptEngineering,
  outputRoot: await mkdtemp(path.join(tmpdir(), 'roadmap-dry-run-')),
  sourceRepository: 'fullstack-javascript-roadmap',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  generatedAt: '2026-07-26T12:00:00.000Z',
  nodeVersion: '24.0.0',
  pnpmVersion: '11.0.0',
});

describe('runTemplateDryRun', () => {
  it('scans selected source, materializes, scans output, checks file set, and verifies', async () => {
    const report = await runTemplateDryRun(await options());
    expect(report.diagnostics).toEqual([]);
    expect(report.status).toBe('passed');
    expect(report.artifact?.functionalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.verification?.status).toBe('passed');
    // The generated tree must be non-empty: a pipeline that produced nothing would
    // otherwise satisfy every assertion above except this one.
    expect(report.artifact?.files.length).toBeGreaterThan(0);
    // Independent verification really ran both ordered commands.
    expect(report.verification?.commands).toHaveLength(2);
  }, 600_000);

  it('does not invoke materialization or verification after selected-source scan failure', async () => {
    const materialize = vi.fn();
    const verify = vi.fn();
    const dependencies = {
      scanPublicationFiles: () =>
        Promise.resolve(
          failure([
            {
              code: 'PUBLICATION_SECRET_002',
              severity: 'error',
              location: { file: 'files/.env.example' },
              observed: 'token',
              expected: 'No token',
              reason: 'Fixture failure',
              remediation: 'Remove token',
              documentation: 'docs/maintainers/template-publication.md',
            },
          ]),
        ),
      materializeTemplate: materialize,
      verifyGeneratedTemplate: verify,
    } satisfies Partial<TemplateDryRunDependencies>;

    const report = await runTemplateDryRun(await options(), dependencies);
    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('PUBLICATION_SECRET_002');
    expect(materialize).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it('does not execute generated commands after output-tree scan failure', async () => {
    const verify = vi.fn();
    const report = await runTemplateDryRun(await options(), {
      scanPublicationTree: () =>
        Promise.resolve(
          failure([
            {
              code: 'PUBLICATION_CONTENT_001',
              severity: 'error',
              location: { file: 'generated/README.md' },
              observed: 'maintainer-only marker',
              expected: 'Publishable content only',
              reason: 'Generated output contains forbidden material',
              remediation: 'Remove the marker from template source',
              documentation: 'docs/maintainers/template-publication.md',
            },
          ]),
        ),
      verifyGeneratedTemplate: verify,
    });
    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('PUBLICATION_CONTENT_001');
    expect(verify).not.toHaveBeenCalled();
  }, 120_000);

  it('does not execute generated commands when the reviewed file set drifts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-template-fixture-'));
    await mkdir(path.join(root, 'files'), { recursive: true });
    await mkdir(path.join(root, 'publication-tests'), { recursive: true });
    await copyFile(
      path.join(javascriptEngineering, 'template.yaml'),
      path.join(root, 'template.yaml'),
    );
    await writeFile(path.join(root, 'files', 'README.md'), '# fixture\n');
    await writeFile(
      path.join(root, 'publication-tests', 'expected-files.json'),
      JSON.stringify(['README.md', 'unexpected.txt']),
    );

    const verify = vi.fn();
    const report = await runTemplateDryRun(
      { ...(await options()), templateRoot: root },
      { verifyGeneratedTemplate: verify },
    );
    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_FILESET_001');
    expect(verify).not.toHaveBeenCalled();
  }, 120_000);

  it('reports the exact file-set drift rather than only that it differed', async () => {
    // A diagnostic that says "sets differ" without naming the difference cannot be
    // acted on. The observed/expected pair must carry the real generated paths.
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-template-drift-'));
    await mkdir(path.join(root, 'files'), { recursive: true });
    await mkdir(path.join(root, 'publication-tests'), { recursive: true });
    await copyFile(
      path.join(javascriptEngineering, 'template.yaml'),
      path.join(root, 'template.yaml'),
    );
    await writeFile(path.join(root, 'files', 'README.md'), '# fixture\n');
    await writeFile(
      path.join(root, 'publication-tests', 'expected-files.json'),
      JSON.stringify(['README.md']),
    );

    const report = await runTemplateDryRun(
      { ...(await options()), templateRoot: root },
      { verifyGeneratedTemplate: vi.fn() },
    );
    expect(report.status).toBe('failed');
    const diagnostic = report.diagnostics[0];
    expect(diagnostic?.code).toBe('TEMPLATE_FILESET_001');
    // Re-pointed from `diagnostic.expected` to `diagnostic.observed` under Owner
    // ruling R6 (defect D14): the plan's shape assigned string[] to a field typed
    // string. The assertion is re-pointed, NOT weakened — both lists are still
    // checked by exact value, so this fails if the file-set comparison breaks.
    // Narrowed by a runtime guard rather than an `as` cast: a cast would assert the
    // shape instead of verifying it, and would keep passing if `observed` changed.
    expect(isFileSetObservation(diagnostic?.observed)).toBe(true);
    if (!isFileSetObservation(diagnostic?.observed)) return;
    expect(diagnostic.observed.expected).toEqual(['README.md']);
    expect(diagnostic.observed.actual).toEqual(['.roadmap/template-manifest.json', 'README.md']);
    expect(diagnostic.expected).toBe(
      'The generated file set recorded in publication-tests/expected-files.json',
    );
  }, 120_000);

  it('fails closed with TEMPLATE_PIPELINE_999 when a stage throws', async () => {
    const verify = vi.fn();
    const report = await runTemplateDryRun(await options(), {
      selectPublicationFiles: () => {
        throw new Error('synthetic selector explosion');
      },
      verifyGeneratedTemplate: verify,
    });
    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_PIPELINE_999');
    expect(report.diagnostics[0]?.observed).toContain('synthetic selector explosion');
    expect(verify).not.toHaveBeenCalled();
  });

  it('fails closed when the expected-file fixture is missing or malformed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-template-nofixture-'));
    await mkdir(path.join(root, 'files'), { recursive: true });
    await copyFile(
      path.join(javascriptEngineering, 'template.yaml'),
      path.join(root, 'template.yaml'),
    );
    await writeFile(path.join(root, 'files', 'README.md'), '# fixture\n');

    const verify = vi.fn();
    const report = await runTemplateDryRun(
      { ...(await options()), templateRoot: root },
      { verifyGeneratedTemplate: verify },
    );
    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_PIPELINE_999');
    expect(verify).not.toHaveBeenCalled();
  }, 120_000);
});
