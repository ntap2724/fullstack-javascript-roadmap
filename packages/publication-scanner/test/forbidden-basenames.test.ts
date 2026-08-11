import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentPolicies, forbiddenBasenames, forbiddenPathSegments } from '../src/policies.js';
import { MAX_SCANNABLE_FILE_BYTES, scanPublicationTree } from '../src/index.js';

// F3-B. Four of the five declared never-publish basenames could be DELETED from
// `forbiddenBasenames` one at a time with no control-bearing test failing: `.env`,
// `id_rsa`, `id_ed25519`, and `credentials.json`. Each deletion left the suite at a
// literal 503/503 exit 0 — `.env` on a re-run, its first run having been perturbed by an
// unrelated known-flaky docs test. A declared control that no test exercises is a comment
// that compiles.
//
// `.npmrc` is ALREADY defended, twice over — deleting it fails the
// dotfile-not-allowlisted case in test/invalid-fixtures.test.ts and the forbidden-dotfile
// case in test/selected-files.test.ts. It is deliberately not duplicated here.
//
// Each pair is a forbidden basename and its NEAR-MISS permitted twin: the public half of a
// keypair, a checked-in example environment file, a redacted credentials sample — all four
// twins are files that legitimately ship. `forbiddenBasenames` is matched by EXACT name, so
// every twin must stay accepted, and asserting that does two jobs at once — it makes each
// rejection attributable to the exact basename and nothing else, and it pins the rule
// against being broadened to a prefix or substring match, which would reject all four twins
// and break real templates.
//
// Every twin is deliberately chosen to be a PREFIX EXTENSION of its forbidden partner, so
// the broadening is caught by all four cases rather than by whichever one happened to be
// unlucky. This was verified by mutation and not assumed: replacing the exact-match test
// in scan-path.ts with `basename.startsWith(entry)` fails all four cases below.
const cases = [
  { forbidden: '.env', permitted: '.env.example' },
  { forbidden: 'id_rsa', permitted: 'id_rsa.pub' },
  { forbidden: 'id_ed25519', permitted: 'id_ed25519.pub' },
  { forbidden: 'credentials.json', permitted: 'credentials.json.example' },
] as const;

// `files` is NOT a forbidden path segment, and the fixture is deliberately flat inside
// it. `pathDiagnostic` emits ONE code, PUBLICATION_PATH_001, for the segment rule and the
// basename rule alike, and splitting that code is forbidden this round, so attribution
// has to come from construction instead: put the fixture where the segment rule provably
// cannot fire, and the only remaining source of that code is the basename rule.
// `files/solutions/.env` would produce an identical diagnostic and prove nothing.
const fixtureDirectory = 'files';

// A benign payload is UNNATURAL for every one of these four filenames, so it is built
// deliberately rather than sampled from a realistic file. A realistic `id_rsa` carries
// `-----BEGIN OPENSSH PRIVATE KEY-----` and a realistic `credentials.json` carries an
// AKIA key id; either one is rejected by a CONTENT policy even with the basename entry
// deleted, so the natural fixture passes while certifying a deleted control. Absolute
// paths are just as natural in a `.env` and PUBLICATION_INTERNAL_002 matches `/home/...`,
// `/Users/...` and `C:\Users\...`, so there is none here. A content hit must INVALIDATE
// this fixture, not satisfy it, which is why benignity is asserted in-process below
// against the exported policy array rather than judged by eye.
const benignPayload = '# non-secret example values only\nPORT=3000\nFEATURE_FLAG=true\n';

// Fires exactly one content policy. Used to prove the permitted twin is accepted because
// it is PERMITTED, not because the tree walk never offered it to the policy layer — an
// `ok === true` from a file that was silently skipped would be a vacuous contrast case.
const canaryPayload = 'ROADMAP_MAINTAINER_ONLY\n';

async function treeContaining(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-basename-'));
  await mkdir(path.join(root, fixtureDirectory), { recursive: true });
  for (const [basename, payload] of Object.entries(files)) {
    await writeFile(path.join(root, fixtureDirectory, basename), payload);
  }
  return root;
}

describe('forbidden publication basenames', () => {
  for (const { forbidden, permitted } of cases) {
    it(`rejects ${forbidden} and still accepts ${permitted}`, async () => {
      // Non-vacuity, asserted IN-PROCESS against the real exported policy values rather
      // than assumed. If any of these drifted, the scans below would pass for a reason
      // that has nothing to do with the basename rule.
      //
      // There is deliberately NO `expect(forbiddenBasenames.has(forbidden)).toBe(true)`
      // here, and its absence is load-bearing. An earlier draft had one. It mirrors the
      // declaration instead of exercising it, so every deletion mutant died on THAT line
      // and the scan assertions below never ran — the mutation evidence proved only that
      // the denylist had been edited, which is the very "a declared control that no test
      // exercises" failure this round exists to correct. Membership is proven the only way
      // that counts: the scanner rejects the file, and rejects nothing else.
      expect(contentPolicies.filter((policy) => policy.pattern.test(benignPayload))).toEqual([]);
      expect(
        contentPolicies
          .filter((policy) => policy.pattern.test(canaryPayload))
          .map(({ code }) => code),
      ).toEqual(['PUBLICATION_CONTENT_001']);
      // Both remaining set assertions are NEGATIVE, so deleting a denylist entry cannot
      // trip either one and neither can preempt the behavioural assertions below.
      expect(forbiddenBasenames.has(permitted)).toBe(false);
      expect(forbiddenPathSegments.has(fixtureDirectory)).toBe(false);
      // Pins the twin's guarding POWER, not just its identity: it has to stay a strict
      // prefix extension of the forbidden name, or this case quietly stops catching a
      // rule broadened from exact match to prefix match.
      expect(permitted.startsWith(forbidden)).toBe(true);
      expect(permitted).not.toBe(forbidden);
      expect(Buffer.byteLength(benignPayload)).toBeLessThan(MAX_SCANNABLE_FILE_BYTES);

      // CONTRAST, asserted ACCEPTED. Same payload, same directory, same depth, same
      // size, no symlink — only the basename differs from the rejected scan below. This
      // is what makes that rejection attributable to the basename rather than to the
      // payload, the directory, the file size, or containment, and it is what keeps this
      // test from being circular.
      const accepted = await treeContaining({ [permitted]: benignPayload });
      const acceptedResult = await scanPublicationTree(accepted);
      expect(acceptedResult.diagnostics).toEqual([]);
      expect(acceptedResult.ok).toBe(true);

      // The contrast above is only meaningful if that file was genuinely SCANNED. The
      // same path carrying the canary must be rejected with a content diagnostic located
      // at exactly that path, which proves the tree walk enumerated the twin — including
      // the `.env.example` dotfile — and handed its bytes to the policy layer.
      const scanned = await treeContaining({ [permitted]: canaryPayload });
      const scannedResult = await scanPublicationTree(scanned);
      expect(scannedResult.diagnostics.map(({ code }) => code)).toEqual([
        'PUBLICATION_CONTENT_001',
      ]);
      expect(scannedResult.diagnostics[0]?.location.file).toBe(`${fixtureDirectory}/${permitted}`);

      // The control speaking. Both files sit in ONE tree so the rejection and the
      // acceptance are observed in a single scan, with nothing varying between them but
      // the name. Asserted as the EXACT diagnostic array, never `toContain`: `toContain`
      // admits extras, so an unrelated second rejection would satisfy it, and a rule
      // broadened to a prefix match would add a second PUBLICATION_PATH_001 for the twin
      // that only exact equality can catch. A bare `ok === false` would prove even less —
      // a content match, an oversized file, a symlink or a containment failure each
      // produce it too, and PUBLICATION_INTERNAL_999 produces it by crashing.
      const rejected = await treeContaining({
        [forbidden]: benignPayload,
        [permitted]: benignPayload,
      });
      const result = await scanPublicationTree(rejected);
      expect(result.diagnostics.map(({ code }) => code)).toEqual(['PUBLICATION_PATH_001']);
      expect(result.diagnostics[0]?.location.file).toBe(`${fixtureDirectory}/${forbidden}`);
      // Severity is pinned because it is the shipping decision: a warning would leave
      // `ok === true` and publish the file this control exists to withhold.
      expect(result.diagnostics[0]?.severity).toBe('error');
      expect(result.ok).toBe(false);
    });
  }
});
