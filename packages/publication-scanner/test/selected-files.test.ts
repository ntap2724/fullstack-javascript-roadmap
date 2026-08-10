import { cp, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectPublicationFiles } from '@roadmap/template-builder';
import { scanPublicationFiles, scanPublicationTree } from '../src/index.js';

const fixture = new URL('../../../fixtures/publication/valid/minimal-template/', import.meta.url);

describe('selected source scanning', () => {
  it('scans only selected public files, not private fixture storage', async () => {
    const selected = await selectPublicationFiles(fixture);

    // D11 non-vacuity guard: absence of findings is not proof of scanning. If
    // selection returned nothing, `ok` would be true for the wrong reason and this
    // test would certify a scanner that never opened a file.
    expect(selected.length).toBeGreaterThan(0);
    expect(selected).toContain('files/README.md');
    // The private fixture exists on disk but must not be among the scanned paths.
    const onDisk = await readdir(fileURLToPath(fixture));
    expect(onDisk).toContain('private-fixtures');
    expect(selected.some((entry) => entry.startsWith('private-fixtures/'))).toBe(false);

    const result = await scanPublicationFiles(fixture, selected);
    expect(result.ok).toBe(true);
  });

  it('rejects a selected symlink rather than following it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-link-'));
    await cp(fileURLToPath(fixture), root, { recursive: true });
    const target = path.join(root, 'private-fixtures');
    const link = path.join(root, 'files', 'leak');

    // Created at RUNTIME, never committed. This repository sets core.symlinks=false,
    // so a committed link checks out as a regular file holding its target path and
    // PUBLICATION_SYMLINK_001 would silently never fire (D7). Failure to create the
    // link is a test-environment failure and must fail loudly, never skip.
    await symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');

    const result = await scanPublicationFiles(root, ['files/leak']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('PUBLICATION_SYMLINK_001');
    expect(result.diagnostics[0]?.location.file).toBe('files/leak');
  });

  it('reports a symlink discovered by whole-tree enumeration', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-tree-link-'));
    await writeFile(path.join(root, 'README.md'), '# generated\n');
    const secret = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-secret-'));
    await writeFile(path.join(secret, 'answer.js'), 'export const answer = 42;\n');
    await symlink(
      secret,
      path.join(root, 'leak'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await scanPublicationTree(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The link must be reported, and its target must NOT have been walked into:
    // no diagnostic may reference a path underneath the link.
    expect(result.diagnostics.map(({ code }) => code)).toContain('PUBLICATION_SYMLINK_001');
    expect(result.diagnostics.some(({ location }) => location.file.startsWith('leak/'))).toBe(
      false,
    );
  });

  it('blocks forbidden dotfiles, oversized files, and tokens inside .env.example', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-policy-'));
    await writeFile(path.join(root, '.npmrc'), 'registry=https://registry.npmjs.org/\n');
    let result = await scanPublicationTree(root);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.code).toBe('PUBLICATION_PATH_001');

    await writeFile(path.join(root, '.npmrc'), '');
    await writeFile(path.join(root, 'large.bin'), Buffer.alloc(2 * 1024 * 1024 + 1));
    result = await scanPublicationTree(root);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map(({ code }) => code)).toContain('PUBLICATION_CONTENT_002');
    }

    const tokenRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-token-'));
    await writeFile(
      path.join(tokenRoot, '.env.example'),
      'TOKEN=github_pat_1234567890123456789012345\n',
    );
    result = await scanPublicationTree(tokenRoot);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics.map(({ code }) => code)).toContain('PUBLICATION_SECRET_002');
    }
  });

  it('accepts a file exactly at the size limit and rejects one byte beyond it', async () => {
    // Pins the boundary. An implementation using >= instead of > passes the plan's
    // own oversized case but fails here.
    const atLimit = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-at-limit-'));
    await writeFile(path.join(atLimit, 'payload.bin'), Buffer.alloc(2 * 1024 * 1024, 0x61));
    expect((await scanPublicationTree(atLimit)).ok).toBe(true);

    const overLimit = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-over-limit-'));
    await writeFile(path.join(overLimit, 'payload.bin'), Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
    const result = await scanPublicationTree(overLimit);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toContain('PUBLICATION_CONTENT_002');
  });

  it('fails closed when a selected path escapes the scanned root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-escape-'));
    await writeFile(path.join(root, 'README.md'), '# generated\n');
    const result = await scanPublicationFiles(root, ['../outside.txt']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('PUBLICATION_INTERNAL_999');
  });

  it('fails closed when the scanned root does not exist', async () => {
    const missing = path.join(tmpdir(), 'roadmap-publication-does-not-exist-12345');
    const result = await scanPublicationTree(missing);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]?.code).toBe('PUBLICATION_INTERNAL_999');
  });

  it('does not decode binary content as text', async () => {
    // A NUL-bearing file must be skipped by content scanning, not misreported.
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-binary-'));
    await writeFile(path.join(root, 'image.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]));
    const result = await scanPublicationTree(root);
    expect(result.ok).toBe(true);
  });
});
