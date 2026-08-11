# Template publication

How a learner starter repository is generated, scanned, verified, and released —
and, just as importantly, what this machinery does **not** guarantee.

## The release boundary

- **Dry runs are permitted in contributor worktrees.** `pnpm verify:templates`
  generates, scans, and verifies locally. It creates local artifacts only.
- **Implementation agents receive no GitHub publication credentials.** Nothing in
  this repository can push to a public starter repository.
- **Public repository mutation requires a protected release workflow.** No local
  command publishes. A dry run that passes is a precondition for release, not a
  release.
- **Generated starter repositories are never edited directly.** A fix belongs in
  `templates/<name>/files/**` and reaches learners through a new generation. An
  edit made directly in a published repository is destroyed by the next release
  and breaks the provenance chain.
- **Every public artifact points back to its source.** `.roadmap/template-manifest.json`
  records the exact source commit, template version, curriculum version, toolchain,
  and contract versions.

## The pipeline, and why its order is the security property

```text
load definition
  -> select files (allowlist)
  -> scan SELECTED SOURCE          <- fails closed
  -> materialize into a fresh directory
  -> scan the COMPLETE GENERATED TREE  <- fails closed
  -> compare against the reviewed file set
  -> verify the generated repository   <- first command execution
```

Both scans and the reviewed-file-set comparison complete **before**
`verifyGeneratedTemplate` runs any command inside the generated repository. A
template carrying a leak therefore never reaches command execution. Changing this
order silently would defeat the control while leaving every test name intact, so
the ordering is asserted directly: the pipeline tests inject failures at each
stage and assert the verifier was **never called**.

Publication is **allowlist-based**. Exclusion rules are defense in depth, not the
primary selection mechanism. A file is published because `publication.include`
selected it, not because no rule happened to reject it.

## Two verification modes, deliberately different

| Command                | Proves                              | Expected on a fresh starter      |
| ---------------------- | ----------------------------------- | -------------------------------- |
| `pnpm verify:baseline` | the template itself is healthy      | **passes**                       |
| `pnpm verify`          | the learner completed the milestone | **fails** until the work is done |

Publication invokes `verify:baseline`. A learner-facing `verify` failure on
untouched starter code is the correct initial state and must never be read as a
broken template.

## Diagnostics

| Code                       | Meaning                                               |
| -------------------------- | ----------------------------------------------------- |
| `PUBLICATION_PATH_001`     | forbidden path segment or file name                   |
| `PUBLICATION_CONTENT_001`  | maintainer-only marker in published content           |
| `PUBLICATION_CONTENT_002`  | file too large for the reviewed scanner limit (2 MiB) |
| `PUBLICATION_INTERNAL_001` | internal or private repository URL                    |
| `PUBLICATION_INTERNAL_002` | absolute local filesystem path                        |
| `PUBLICATION_SECRET_001`   | private key block                                     |
| `PUBLICATION_SECRET_002`   | GitHub token pattern                                  |
| `PUBLICATION_SECRET_003`   | AWS access key id pattern                             |
| `PUBLICATION_SYMLINK_001`  | symbolic link in publication input or output          |
| `PUBLICATION_SYMLINK_002`  | path resolves outside the root via an ancestor link   |
| `PUBLICATION_INTERNAL_999` | scanner could not complete — fails closed             |
| `TEMPLATE_FILESET_001`     | generated file set differs from the reviewed fixture  |
| `TEMPLATE_PIPELINE_999`    | pipeline crashed — fails closed                       |
| `TEMPLATE_RELEASE_001`     | refused: source worktree is dirty                     |

A scanner crash, a verifier crash, an unreadable expectation fixture, and missing
evidence all **block** release. Nothing degrades to a warning.

## Known limitations — read this before trusting a green run

**Scanner coverage is defense in depth. A passing scan is not proof that no secret
exists.** Release credentials remain isolated and GitHub secret scanning remains
enabled separately. The following gaps are real, measured against the shipped
policy, and deliberately left open rather than closed by unreviewed pattern
broadening.

### Path policy is a denylist of known-bad names, not a semantic classifier

`forbiddenPathSegments` matches specific **directory** names at any depth.
`forbiddenBasenames` matches specific **file** names. Measured against the shipped
module:

| Path                                            | Result         |
| ----------------------------------------------- | -------------- |
| `files/solution/answer.js`                      | CAUGHT         |
| `files/src/modules/deep/answer-key/expected.md` | CAUGHT         |
| `files/.npmrc`                                  | CAUGHT         |
| `files/answer.js`                               | **NOT caught** |
| `files/answers.js`                              | **NOT caught** |
| `files/src/solution.js`                         | **NOT caught** |
| `files/.secretrc`                               | **NOT caught** |
| `files/.travis.yml`                             | **NOT caught** |

Two consequences stated plainly:

- **A renamed answer file is not detected by name alone.** A solution moved to
  `files/answer.js` is caught only if it sits in a forbidden directory or its
  contents match a content policy.
- **"Unexpected dotfile" is not a policy.** Only the specific dotfiles in
  `forbiddenBasenames` are rejected. An arbitrary new dotfile is published.

The real control against both is the **allowlist plus the reviewed file set**: a
new file appears in the generated tree, `TEMPLATE_FILESET_001` fires, and a human
must review the diff before `expected-files.json` is updated. Path policy is the
second line, not the first.

### Content policy matches patterns, not meaning

Content is inspected as UTF-8 text. NUL bytes are stripped before decoding rather than
causing the file to be skipped, so a secret embedded in a file that also contains NUL
bytes is still detected (INV-F1). A secret in an unrecognized format, a base64 blob, or
an image passes.
Files above 2 MiB are **rejected rather than scanned**, so an oversized payload
cannot pass unexamined.

Diagnostics record the **matching pattern**, never the matched text, so a real
secret is not copied into diagnostics, logs, or CI output.

### Symlinks

Symlinks are rejected, never followed, in both the selected source and the
generated tree. Enumeration does not descend into a link, so a link cannot pull
bytes from outside the publication root into a scan report.

Note for contributors: this repository sets `core.symlinks=false`. A **committed**
symlink checks out as a regular file containing its target path, and a committed
junction is dereferenced by git so the private bytes land at the public path. For
that reason no link is committed as a fixture anywhere; the tests create links at
runtime and fail loudly if creation is not possible.

### Platform

The controls are exercised on Windows. No POSIX result is claimed here;
cross-platform proof belongs to the cross-platform CI work package.

## When a dry run fails

1. Read the diagnostic `code`, `location`, and `remediation`.
2. Fix the **source template**, never the generated output.
3. If the generated file set legitimately changed, review the diff and update
   `templates/<name>/publication-tests/expected-files.json` in the same change.
4. Re-run `pnpm verify:templates`.

`TEMPLATE_RELEASE_001` means the worktree is dirty. Release evidence must describe
a committed state: otherwise the bytes that were scanned and verified are not the
bytes a reviewer can retrieve from the commit recorded in provenance. Commit or
stash, then re-run.
