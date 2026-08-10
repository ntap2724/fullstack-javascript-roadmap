import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTemplateDefinition, materializeTemplate } from '@roadmap/template-builder';
import type { PublicationArtifact } from '@roadmap/template-builder';
import type { TemplateDefinition, TemplateProvenance } from '@roadmap/template-contract';
import { verifyGeneratedTemplate } from '../src/index.js';

const source = new URL('../../../templates/javascript-engineering/', import.meta.url);

// Fixture roots are resolved from this file's own location, never from process.cwd().
// vitest sets cwd to the PROJECT root (packages/template-verifier), so a bare relative
// path would point at a directory that does not exist — which would make the
// node_modules leak assertion below pass vacuously against a missing path.
const verifierFixtures = new URL('../../../fixtures/publication/verifier/', import.meta.url);

function fixtureRoot(name: string): string {
  return fileURLToPath(new URL(`${name}/`, verifierFixtures));
}

const provenance: TemplateProvenance = {
  schemaVersion: 1,
  templateId: 'template-javascript-engineering',
  templateVersion: '0.1.0',
  curriculumVersion: '0.1.0',
  sourceRepository: 'fullstack-javascript-roadmap',
  sourceCommit: '0123456789abcdef0123456789abcdef01234567',
  generatedAt: '2026-07-26T12:00:00.000Z',
  toolchain: { node: '24.0.0', pnpm: '11.0.0' },
  contractVersions: { exercise: 1, rubric: 1, evidence: 1, template: 1 },
};

function fixtureArtifact(name: string): PublicationArtifact {
  return {
    root: fixtureRoot(name),
    files: [],
    functionalSha256: '0'.repeat(64),
  };
}

function definitionFor(
  install: TemplateDefinition['verification']['install'],
  baseline: TemplateDefinition['verification']['baseline'],
): TemplateDefinition {
  return {
    schemaVersion: 1,
    id: 'template-verifier-fixture',
    repositoryName: 'verifier-fixture',
    version: '0.1.0',
    curriculum: { release: '0.1.0', entryPoint: 'project-verifier-fixture' },
    runtime: { nodeFamily: 24, packageManager: 'pnpm' },
    publication: { include: ['files/**'], exclude: [], textTransforms: [] },
    verification: { install, baseline },
  };
}

describe('verifyGeneratedTemplate', () => {
  it('passes frozen install followed by baseline verification outside the monorepo', async () => {
    const output = await mkdtemp(path.join(tmpdir(), 'roadmap-published-'));
    const built = await materializeTemplate(source, output, provenance);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { definition } = await loadTemplateDefinition(source);
    const report = await verifyGeneratedTemplate(definition, built.value);
    expect(report.status).toBe('passed');
    expect(report.commands.map((entry) => entry.command.command)).toEqual(['pnpm', 'pnpm']);
    expect(report.commands).toHaveLength(2);
  }, 300_000);

  it('stops after install failure and preserves exit evidence', async () => {
    const report = await verifyGeneratedTemplate(
      definitionFor(
        {
          command: process.execPath,
          args: ['-e', 'process.exit(17)'],
          cwd: '.',
          timeoutMs: 10_000,
        },
        { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: '.', timeoutMs: 10_000 },
      ),
      fixtureArtifact('failed-install'),
    );
    expect(report.status).toBe('failed');
    expect(report.commands).toHaveLength(1);
    expect(report.commands[0]?.exitCode).toBe(17);
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_VERIFY_001');
  }, 60_000);

  it('reports baseline failure after successful install', async () => {
    const report = await verifyGeneratedTemplate(
      definitionFor(
        { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: '.', timeoutMs: 10_000 },
        {
          command: process.execPath,
          args: ['-e', 'process.exit(23)'],
          cwd: '.',
          timeoutMs: 10_000,
        },
      ),
      fixtureArtifact('failed-baseline'),
    );
    expect(report.commands.map((entry) => entry.exitCode)).toEqual([0, 23]);
    expect(report.diagnostics[0]?.location.pointer).toBe('/verification/baseline');
  }, 60_000);

  it('fails closed on timeout', async () => {
    const report = await verifyGeneratedTemplate(
      definitionFor(
        { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: '.', timeoutMs: 10_000 },
        {
          command: process.execPath,
          args: ['-e', 'setInterval(() => {}, 1000)'],
          cwd: '.',
          timeoutMs: 1_000,
        },
      ),
      fixtureArtifact('timeout'),
    );
    expect(report.status).toBe('failed');
    expect(report.commands.at(-1)?.timedOut).toBe(true);
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_VERIFY_001');
  }, 60_000);

  it('cannot resolve a package that exists only in the source monorepo', async () => {
    // Resolved from this file, so the assertion inspects the REAL fixture directory.
    // A bare relative path here would reject with ENOENT for a non-existent path and
    // report "no leak" without ever looking at the fixture.
    await expect(
      stat(path.join(fixtureRoot('monorepo-leak'), 'node_modules')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    const report = await verifyGeneratedTemplate(
      definitionFor(
        { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: '.', timeoutMs: 60_000 },
        { command: 'pnpm', args: ['verify:baseline'], cwd: '.', timeoutMs: 180_000 },
      ),
      fixtureArtifact('monorepo-leak'),
    );
    expect(report.status).toBe('failed');
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_VERIFY_001');
    expect(report.diagnostics[0]?.location.pointer).toBe('/verification/baseline');
  }, 300_000);

  it('rejects a verification cwd that escapes the artifact root', async () => {
    const report = await verifyGeneratedTemplate(
      definitionFor(
        {
          command: process.execPath,
          args: ['-e', 'process.exit(0)'],
          cwd: '..',
          timeoutMs: 10_000,
        },
        { command: process.execPath, args: ['-e', 'process.exit(0)'], cwd: '.', timeoutMs: 10_000 },
      ),
      fixtureArtifact('failed-install'),
    );
    expect(report.status).toBe('internal-error');
    expect(report.diagnostics[0]?.code).toBe('TEMPLATE_VERIFY_999');
  }, 60_000);
});
