import { cp, mkdtemp, readdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { selectPublicationFiles } from '@roadmap/template-builder';
import { contentPolicies } from '../src/policies.js';
import { scanPublicationFiles, scanPublicationTree } from '../src/index.js';

const fixture = new URL('../../../fixtures/publication/valid/minimal-template/', import.meta.url);

const NUL = Buffer.from([0x00]);

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
    // A NUL-bearing file must not be misreported. NOTE: these bytes match no content
    // policy, so this test passes whether they are skipped OR scanned and found
    // clean. It is deliberately KEPT — it guards the real property that binary input
    // must not crash or produce a false positive — but it is vacuous with respect to
    // INV-F1 and cannot prove the NUL bypass is closed. See the test below, which can.
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-binary-'));
    await writeFile(path.join(root, 'image.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00, 0xff]));
    const result = await scanPublicationTree(root);
    expect(result.ok).toBe(true);
  });

  it('detects policy-matching content even when the file contains NUL bytes', async () => {
    // INV-F1 (OWNER-F1). A single NUL byte previously disabled ALL six content
    // policies via `if (bytes.includes(0)) return []`, so a file could carry a private
    // key, an AWS key id, and a GitHub token in plain view and scan clean.
    // The NUL may guard how bytes are DECODED; it may never disable DETECTION.
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-nul-'));
    const payload = Buffer.concat([
      Buffer.from([0x00]),
      Buffer.from(
        [
          '-----BEGIN RSA PRIVATE KEY-----',
          'AKIAIOSFODNN7EXAMPLE',
          'ghp_0123456789abcdefghijklmnopqrstuvwx',
          'ROADMAP_MAINTAINER_ONLY',
        ].join('\n'),
        'utf8',
      ),
      Buffer.from([0x00]),
    ]);
    await writeFile(path.join(root, 'leaky.bin'), payload);

    const result = await scanPublicationTree(root);
    expect(result.ok).toBe(false);
    if (result.ok) return;

    // Every policy the payload matches must fire. Asserting the exact set rather than
    // `length > 0` keeps this from passing on a single lucky match.
    const codes = [...new Set(result.diagnostics.map(({ code }) => code))].sort();
    expect(codes).toEqual([
      'PUBLICATION_CONTENT_001',
      'PUBLICATION_SECRET_001',
      'PUBLICATION_SECRET_002',
      'PUBLICATION_SECRET_003',
    ]);

    // The MUST-NOT-MOVE guarantee still holds under the fix: `observed` carries the
    // matching pattern, never the matched text, so no secret byte reaches a log.
    for (const diagnostic of result.diagnostics) {
      expect(String(diagnostic.observed)).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(String(diagnostic.observed)).not.toContain('ghp_0123456789');
    }
  });

  // INV-F1, restated binding form: NUL position and count must not affect WHETHER
  // detection occurs. A leading-NUL-only fix passes a prepend test while leaving the
  // bypass open one byte later, so every placement is exercised against every policy.
  // Each carrier was verified to fire exactly its own policy and no other, so a
  // failure here localizes to one policy rather than being ambiguous.
  const carriers = [
    ['PUBLICATION_CONTENT_001', 'ROADMAP_MAINTAINER_ONLY'],
    ['PUBLICATION_INTERNAL_001', 'https://internal.example-corp.net/runbook'],
    ['PUBLICATION_INTERNAL_002', '/home/maintainer/notes.txt'],
    ['PUBLICATION_SECRET_001', '-----BEGIN RSA PRIVATE KEY-----'],
    ['PUBLICATION_SECRET_002', 'ghp_0123456789abcdefghijklmnopqrstuvwx'],
    ['PUBLICATION_SECRET_003', 'AKIAIOSFODNN7EXAMPLE'],
  ] as const;

  const placements = [
    ['leading', (secret: string) => Buffer.concat([NUL, Buffer.from(secret, 'utf8')])],
    ['trailing', (secret: string) => Buffer.concat([Buffer.from(secret, 'utf8'), NUL])],
    [
      'mid-string',
      (secret: string) => {
        const half = Math.floor(secret.length / 2);
        return Buffer.concat([
          Buffer.from(secret.slice(0, half), 'utf8'),
          NUL,
          Buffer.from(secret.slice(half), 'utf8'),
        ]);
      },
    ],
    [
      'interleaved',
      (secret: string) =>
        // Interleave at BYTE level, not by code point: this is a byte-level property,
        // and spreading a string yields code points, which would mishandle non-ASCII.
        Buffer.concat([...Buffer.from(secret, 'utf8')].map((byte) => Buffer.from([0x00, byte]))),
    ],
    [
      'multiple-runs',
      (secret: string) =>
        Buffer.concat([NUL, NUL, NUL, Buffer.from(secret, 'utf8'), NUL, NUL, NUL]),
    ],
  ] as const;

  for (const [code, secret] of carriers) {
    for (const [placement, build] of placements) {
      it(`detects ${code} with ${placement} NUL bytes`, async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-nulpos-'));
        await writeFile(path.join(root, 'payload.bin'), build(secret));

        const result = await scanPublicationTree(root);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(code);

        // A detection fix must not become a disclosure channel: `observed` records the
        // matching pattern, never the matched text. Asserted as EXACT EQUALITY with the
        // policy's pattern source rather than `not.toContain(secret)`. For a literal
        // alternation like /ROADMAP_MAINTAINER_ONLY|BEGIN_PRIVATE_FIXTURE/ the carrier
        // is necessarily a substring of the pattern itself, so a "does not contain"
        // check cannot tell a recorded pattern from leaked text — it fails on correct
        // behavior and would pass on a leak whose text happened not to match. Equality
        // is decidable: only the pattern satisfies it.
        for (const diagnostic of result.diagnostics) {
          const policy = contentPolicies.find((entry) => entry.code === diagnostic.code);
          expect(policy).toBeDefined();
          expect(diagnostic.observed).toBe(policy?.pattern.source);
        }
      });
    }
  }

  it('does not produce spurious diagnostics for genuine binary content', async () => {
    // The other half of the invariant: stripping NULs must not make the scanner cry
    // wolf on real binary. A scanner nobody trusts is a scanner nobody heeds. These
    // bytes are a PNG header plus high-bit noise — no policy content anywhere.
    const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-realbin-'));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const noise = Buffer.from(Array.from({ length: 512 }, (_, index) => (index * 7 + 0x80) % 256));
    await writeFile(path.join(root, 'image.png'), Buffer.concat([png, NUL, noise, NUL]));

    const result = await scanPublicationTree(root);
    expect(result.ok).toBe(true);
  });
});
