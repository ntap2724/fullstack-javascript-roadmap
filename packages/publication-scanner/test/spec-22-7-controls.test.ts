import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanPublicationFiles, scanPublicationTree } from '../src/index.js';

async function makeTree(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-spec227-'));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}

function codes(result: Awaited<ReturnType<typeof scanPublicationFiles>>): readonly string[] {
  return result.diagnostics.map(({ code }) => code);
}

describe('SPEC-22.7 hidden-answer fingerprints (H1/C2)', () => {
  it('detects an exact synthetic answer fingerprint without disclosing answer bytes', async () => {
    const answer = 'synthetic private answer: 6f424ff0\n';
    const fingerprint = createHash('sha256').update(answer).digest('hex');
    const root = await makeTree({ 'files/renamed-notes.txt': answer });

    const result = await scanPublicationFiles(root, ['files/renamed-notes.txt'], {
      answerFingerprints: [fingerprint],
    });

    expect(codes(result)).toContain('PUBLICATION_ANSWER_001');
    const diagnostic = result.diagnostics.find(({ code }) => code === 'PUBLICATION_ANSWER_001');
    expect(JSON.stringify(diagnostic)).not.toContain(answer.trim());
    expect(diagnostic?.observed).toBe('sha256 fingerprint match');
  });

  it('uses exact bytes only: a whitespace change does not match', async () => {
    const answer = 'synthetic private answer\n';
    const fingerprint = createHash('sha256').update(answer).digest('hex');
    const altered = 'synthetic private answer \n';

    // Non-vacuity: the SAME fingerprint and the SAME scan call must still detect the
    // unaltered bytes. Without this contrast, an implementation that never compares
    // anything — or one whose options were silently dropped — passes the assertion below.
    const detecting = await makeTree({ 'files/renamed-notes.txt': answer });
    const detected = await scanPublicationFiles(detecting, ['files/renamed-notes.txt'], {
      answerFingerprints: [fingerprint],
    });
    expect(codes(detected)).toContain('PUBLICATION_ANSWER_001');

    const root = await makeTree({ 'files/renamed-notes.txt': altered });
    const result = await scanPublicationFiles(root, ['files/renamed-notes.txt'], {
      answerFingerprints: [fingerprint],
    });

    // H1 forbids normalized or fuzzy matching: one trailing space must defeat the match.
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // The corpus is an EXPLICIT input (H1). Without fingerprints the control is inert, which
  // is what makes production wiring a real deferred gap rather than a silent default.
  it('reports nothing when no fingerprints are supplied', async () => {
    const answer = 'synthetic private answer: 6f424ff0\n';
    const root = await makeTree({ 'files/renamed-notes.txt': answer });

    const withoutCorpus = await scanPublicationFiles(root, ['files/renamed-notes.txt']);
    expect(codes(withoutCorpus)).not.toContain('PUBLICATION_ANSWER_001');

    const withCorpus = await scanPublicationFiles(root, ['files/renamed-notes.txt'], {
      answerFingerprints: [createHash('sha256').update(answer).digest('hex')],
    });
    expect(codes(withCorpus)).toContain('PUBLICATION_ANSWER_001');
  });
});

describe('SPEC-22.7 submodule ban (S1)', () => {
  it('rejects .gitmodules metadata', async () => {
    const root = await makeTree({
      '.gitmodules': '[submodule "vendor"]\n\tpath = vendor\n\turl = https://example.test/vendor\n',
    });
    const result = await scanPublicationTree(root);
    // EXACT set: the rejection must come from the submodule control alone. `.gitmodules`
    // is not a forbidden basename and its body matches no content policy, so a
    // PUBLICATION_PATH_001 or content code here would mean this test was certifying an
    // unrelated control — precisely the relabelling failure this round must avoid.
    expect(codes(result)).toEqual(['PUBLICATION_SUBMODULE_001']);
    expect(result.diagnostics[0]?.location.file).toBe('.gitmodules');
  });

  it('rejects an index-mode 160000 gitlink when repository metadata is available', async () => {
    const root = await makeTree({ 'README.md': '# public\n' });
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},vendor`],
      { cwd: root },
    );

    const result = await scanPublicationTree(root);
    // The gitlink has no working-tree file, so the directory walk cannot see it: only
    // index inspection can. README.md must stay clean, making the finding attributable.
    expect(codes(result)).toEqual(['PUBLICATION_SUBMODULE_001']);
    expect(result.diagnostics[0]?.location.file).toBe('vendor');
    expect(result.diagnostics[0]?.observed).toBe('index mode 160000 gitlink');
  });

  // The other half: where no git metadata exists, the index surface is simply absent and
  // must not manufacture a finding, or every generated tree would be blocked outright.
  it('does not invent a gitlink finding for a tree with no repository metadata', async () => {
    const root = await makeTree({
      'README.md': '# public\n',
      'src/index.js': 'export default 1;\n',
    });
    const result = await scanPublicationTree(root);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // S1 PLACEMENT. The production pipeline scans the SOURCE template root through
  // `scanPublicationFiles` and the GENERATED tree through `scanPublicationTree`. A source
  // template root lives inside a git repository and therefore HAS an index; a generated
  // tree normally does not. Attaching index inspection only to the tree scan puts the
  // check exclusively where metadata is absent, so the ruled index half never operates on
  // real input. This case exercises the selected-files path directly.
  it('rejects a source-root gitlink through the selected-files scan path', async () => {
    const root = await makeTree({ 'README.md': '# public\n' });
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},vendor`],
      { cwd: root },
    );

    const result = await scanPublicationFiles(root, ['README.md']);

    expect(codes(result)).toEqual(['PUBLICATION_SUBMODULE_001']);
    expect(result.diagnostics[0]?.location.file).toBe('vendor');
    expect(result.diagnostics[0]?.observed).toBe('index mode 160000 gitlink');
  });

  // SCOPING, positive half. The scanned root is a SUBDIRECTORY of the repository, which is
  // the production shape: `templates/<name>` inside this monorepo. The index query must be
  // scoped to the scanned root's subtree and its paths must be publication-relative, so a
  // gitlink at `<scannedRoot>/vendor` is reported as exactly `vendor`.
  it('scopes the index query to the scanned root and reports publication-relative paths', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'roadmap-spec227-repo-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    await mkdir(path.join(repository, 'publication', 'nested'), { recursive: true });
    await writeFile(path.join(repository, 'publication', 'README.md'), '# public\n');
    execFileSync(
      'git',
      [
        'update-index',
        '--add',
        '--cacheinfo',
        `160000,${'1'.repeat(40)},publication/nested/vendor`,
      ],
      { cwd: repository },
    );

    const result = await scanPublicationFiles(path.join(repository, 'publication'), ['README.md']);

    expect(codes(result)).toEqual(['PUBLICATION_SUBMODULE_001']);
    // Publication-relative, never repository-relative: `publication/` must not appear.
    expect(result.diagnostics[0]?.location.file).toBe('nested/vendor');
  });

  // SCOPING, negative half. Asserted separately so neither direction can stand in for the
  // other. A repository-wide query returns this gitlink with a `../` path and attributes an
  // unrelated monorepo submodule to the publication; a correctly scoped query cannot see it.
  it('ignores a gitlink that lies outside the scanned root', async () => {
    const repository = await mkdtemp(path.join(tmpdir(), 'roadmap-spec227-outside-repo-'));
    execFileSync('git', ['init', '--quiet'], { cwd: repository });
    await mkdir(path.join(repository, 'publication'), { recursive: true });
    await mkdir(path.join(repository, 'elsewhere'), { recursive: true });
    await writeFile(path.join(repository, 'publication', 'README.md'), '# public\n');
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `160000,${'2'.repeat(40)},elsewhere/vendor`],
      { cwd: repository },
    );

    const result = await scanPublicationFiles(path.join(repository, 'publication'), ['README.md']);

    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  // Exactly one diagnostic per gitlink. `scanPublicationTree` delegates to
  // `scanPublicationFiles`, so a check present in both layers would emit twice for one
  // gitlink and inflate every report that contains one.
  it('emits exactly one diagnostic per gitlink on the tree scan path', async () => {
    const root = await makeTree({ 'README.md': '# public\n' });
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    execFileSync(
      'git',
      ['update-index', '--add', '--cacheinfo', `160000,${'1'.repeat(40)},vendor`],
      { cwd: root },
    );

    const result = await scanPublicationTree(root);
    const submoduleFindings = result.diagnostics.filter(
      ({ code }) => code === 'PUBLICATION_SUBMODULE_001',
    );
    expect(submoduleFindings).toHaveLength(1);
  });
});

describe('SPEC-22.7 bounded relative module graph (I1/I-C)', () => {
  // Each ruled form is proven RECOGNIZED, not merely tolerated. An `ok === true` on a
  // clean graph would pass even if the parser never ran, so every form is exercised in a
  // second tree where its target is unselected: recognition then forces exactly one
  // PUBLICATION_IMPORT_SELECTION_001 attributed to that form's importer. A form the
  // extractor misses produces no diagnostic and fails here.
  const ruledForms = [
    ['static import', "import './target.js';"],
    ['export-from', "export { value } from './target.js';"],
    ['literal dynamic import', "void import('./target.js');"],
    ['require', "require('./target.js');"],
  ] as const;

  for (const [label, statement] of ruledForms) {
    it(`recognizes ${label} as a real module edge`, async () => {
      const root = await makeTree({
        'files/entry.js': `${statement}\n`,
        'files/target.js': 'export const value = 1;\n',
      });
      // Only entry.js is selected, so a RECOGNIZED edge must escape the selected set.
      const result = await scanPublicationFiles(root, ['files/entry.js']);
      expect(codes(result)).toEqual(['PUBLICATION_IMPORT_SELECTION_001']);
      expect(result.diagnostics[0]?.location.file).toBe('files/entry.js');
    });
  }

  it('ignores bare package specifiers and handles cycles without hanging', async () => {
    const root = await makeTree({
      'src/entry.js': ["import './static.js';", "import 'public-package';"].join('\n'),
      // Cycle: entry -> static -> entry. A naive walk never terminates.
      'src/static.js': "import './entry.js';\n",
    });

    const result = await scanPublicationFiles(root, ['src/entry.js', 'src/static.js']);
    // A bare specifier treated as relative would resolve to nothing and raise
    // PUBLICATION_IMPORT_UNRESOLVED_001; an empty result proves it was ignored.
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a relative edge into a private-test root with its own diagnostic', async () => {
    const root = await makeTree({
      'files/src/entry.js': "import '../../maintainer-tests/hidden.js';\n",
      'maintainer-tests/hidden.js': 'export const hidden = 42;\n',
    });
    const result = await scanPublicationFiles(root, ['files/src/entry.js']);
    expect(codes(result)).toContain('PUBLICATION_IMPORT_PRIVATE_001');
  });

  // The selected set is the graph boundary, so every selected parseable module is a graph
  // node and must be inspected even when the private edge sits in a module reached from
  // another selected node. There is deliberately no separate "entry point" API: seeding
  // every selected node is what keeps the bounded scan complete and cycle-safe.
  //
  // The edge here stays INSIDE the root and is private by SEGMENT (`maintainer-tests`),
  // which is a different branch from the root-escape case asserted separately below.
  // Mutation proved the distinction matters: neutering the segment rule leaves an escaping
  // edge still caught by the escape branch, so a `../../` fixture cannot certify the
  // segment rule and would have credited coverage this test never exercised.
  it('detects a private-test edge in an indirectly imported selected module', async () => {
    const root = await makeTree({
      'files/entry.js': "import './middle.js';\n",
      'files/middle.js': "import './deep.js';\n",
      'files/deep.js': "export { hidden } from './maintainer-tests/hidden.js';\n",
      'files/maintainer-tests/hidden.js': 'export const hidden = 42;\n',
    });

    const result = await scanPublicationFiles(root, [
      'files/entry.js',
      'files/middle.js',
      'files/deep.js',
    ]);

    const diagnostic = result.diagnostics.find(
      ({ code }) => code === 'PUBLICATION_IMPORT_PRIVATE_001',
    );
    // Attributed to the DEEP importer rather than the first selected module.
    expect(diagnostic?.location.file).toBe('files/deep.js');
  });

  // The escape branch, asserted on its own so neither branch can stand in for the other.
  it('rejects a relative edge that escapes the publication root', async () => {
    const root = await makeTree({ 'files/entry.js': "import '../../outside/secret.js';\n" });
    const result = await scanPublicationFiles(root, ['files/entry.js']);
    expect(codes(result)).toEqual(['PUBLICATION_IMPORT_PRIVATE_001']);
  });

  // I1 forbids regex-only parsing. A regex scanner reports these two lines as real edges
  // and fails this test; the parser-backed preprocessor does not. This is the executable
  // difference between the ruled implementation and the forbidden one.
  it('ignores import-like text inside comments and string literals', async () => {
    const root = await makeTree({
      'files/entry.js': [
        "// import '../../maintainer-tests/commented.js';",
        "/* require('../../maintainer-tests/blocked.js'); */",
        'const sample = "import \'../../maintainer-tests/quoted.js\'";',
        'export const value = sample.length;',
      ].join('\n'),
    });

    const result = await scanPublicationFiles(root, ['files/entry.js']);
    expect(result.diagnostics).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a resolved relative edge outside the selected set', async () => {
    const root = await makeTree({
      'files/entry.js': "export { hidden } from './not-selected.js';\n",
      'files/not-selected.js': 'export const hidden = 42;\n',
    });
    const result = await scanPublicationFiles(root, ['files/entry.js']);
    expect(codes(result)).toContain('PUBLICATION_IMPORT_SELECTION_001');
  });

  it('fails closed on an unresolved relative edge with a dedicated diagnostic', async () => {
    const root = await makeTree({ 'files/entry.js': "void import('./missing.js');\n" });
    const result = await scanPublicationFiles(root, ['files/entry.js']);
    expect(codes(result)).toContain('PUBLICATION_IMPORT_UNRESOLVED_001');
    expect(codes(result)).not.toContain('PUBLICATION_IMPORT_PRIVATE_001');
    expect(codes(result)).not.toContain('PUBLICATION_IMPORT_SELECTION_001');
  });

  // Resolution must not become the hole the containment controls close elsewhere. A
  // lexically in-root specifier can still land on a symlink whose real bytes live outside
  // the root, which no lexical check can see. Resolution therefore refuses links and
  // realpath-escaping candidates rather than admitting them as resolved public modules.
  //
  // Created at RUNTIME, never committed: this repository sets core.symlinks=false, so a
  // committed link checks out as a regular file and the case would silently stop testing
  // anything (D7). Failure to create it must fail loudly rather than skip.
  it('does not parse a selected final-component symlink rejected by containment', async () => {
    const root = await makeTree({ 'files/clean.js': 'export const clean = true;\n' });
    const outside = await mkdtemp(path.join(tmpdir(), 'roadmap-spec227-importer-outside-'));
    const secretSpecifier = '../../F01_FINAL_COMPONENT_SECRET.js';
    const target = path.join(outside, 'private-test.js');
    await writeFile(target, `import '${secretSpecifier}';\n`);
    await symlink(target, path.join(root, 'files', 'linked.js'), 'file');

    const result = await scanPublicationFiles(root, ['files/clean.js', 'files/linked.js']);

    expect(codes(result)).toContain('PUBLICATION_SYMLINK_001');
    // This is the load-bearing assertion: frozen ba28fb3 dereferences linked.js in the
    // graph stage and copies this out-of-root specifier into diagnostic.observed.
    expect(result.diagnostics.map(({ observed }) => observed)).not.toContain(secretSpecifier);
  });

  it('does not parse a selected file reached through an escaping ancestor symlink', async () => {
    const root = await makeTree({ 'files/clean.js': 'export const clean = true;\n' });
    const outside = await mkdtemp(path.join(tmpdir(), 'roadmap-spec227-ancestor-outside-'));
    const secretSpecifier = '../../F01_ANCESTOR_SECRET.js';
    await writeFile(path.join(outside, 'private-test.js'), `require('${secretSpecifier}');\n`);
    await symlink(
      outside,
      path.join(root, 'files', 'linked-directory'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const result = await scanPublicationFiles(root, [
      'files/clean.js',
      'files/linked-directory/private-test.js',
    ]);

    expect(codes(result)).toContain('PUBLICATION_SYMLINK_002');
    // A rejection code alone proves only scanOne rejected it. It does not prove the later
    // graph stage refrained from reading it, so assert the private bytes never surface.
    expect(result.diagnostics.map(({ observed }) => observed)).not.toContain(secretSpecifier);
  });

  it('does not resolve a relative edge through a symlink to out-of-root bytes', async () => {
    const root = await makeTree({ 'files/entry.js': "import './linked.js';\n" });
    const outside = await mkdtemp(path.join(tmpdir(), 'roadmap-spec227-outside-'));
    const target = path.join(outside, 'secret.js');
    await writeFile(target, 'export const secret = 42;\n');
    await symlink(target, path.join(root, 'files', 'linked.js'), 'file');

    const result = await scanPublicationFiles(root, ['files/entry.js']);

    // Fails closed as UNRESOLVED rather than being admitted: the edge is never treated as
    // a selected in-root module, and the out-of-root location is not disclosed.
    expect(codes(result)).toEqual(['PUBLICATION_IMPORT_UNRESOLVED_001']);
    for (const entry of result.diagnostics) {
      expect(String(entry.observed)).not.toContain(outside);
    }
  });
});
