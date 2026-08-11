import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentPolicies, forbiddenBasenames } from '../src/policies.js';
import { scanPublicationTree } from '../src/index.js';

// F3. Four of the six declared never-publish path segments could be DELETED from
// `forbiddenPathSegments` with the entire suite still green at 499/499: `solutions`,
// `private-fixtures`, `maintainer-tests`, and `internal-review`. A control that no test
// exercises is not a control, so nothing prevented a future edit from silently removing
// one and shipping the content it exists to withhold.
//
// `solution` and `answer-key` are ALREADY covered, by fixtures/publication/invalid/
// solution-path and nested-answer: deleting either entry fails the existing suite. They
// are deliberately not duplicated here.
const uncoveredSegments = [
  'solutions',
  'private-fixtures',
  'maintainer-tests',
  'internal-review',
] as const;

// A directory name that is NOT a declared forbidden segment, for the contrast scan.
const benignSegment = 'public-notes';

// Chosen to match no content policy, so content detection cannot be the cause.
const benignPayload = '# notes\n\nordinary learner text that no publication policy matches\n';

// Chosen to be absent from forbiddenBasenames, so the basename rule cannot be the cause.
const benignBasename = 'notes.md';

async function treeWithDirectory(segment: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'roadmap-publication-segment-'));
  await mkdir(path.join(root, 'files', segment), { recursive: true });
  await writeFile(path.join(root, 'files', segment, benignBasename), benignPayload);
  return root;
}

describe('forbidden publication path segments', () => {
  describe.each(uncoveredSegments)('%s', (segment) => {
    it('rejects a benign file solely because of the forbidden directory name', async () => {
      // Non-vacuity, asserted IN-PROCESS against the actual exported policy sets rather
      // than assumed. `pathDiagnostic` emits PUBLICATION_PATH_001 for the basename rule
      // as well as the segment rule, so a probe that were rejectable on its own merits
      // would let this case pass while never exercising the segment rule at all.
      expect(contentPolicies.filter((policy) => policy.pattern.test(benignPayload))).toEqual([]);
      expect(forbiddenBasenames.has(benignBasename)).toBe(false);

      // Contrast scan: same payload, same basename, same depth, non-forbidden directory
      // name — and it is ACCEPTED. Only the directory name varies between the two scans,
      // which is what makes the rejection below attributable to the segment rule and not
      // to the payload, the basename, the file size, or containment.
      const accepted = await scanPublicationTree(await treeWithDirectory(benignSegment));
      expect(accepted.ok).toBe(true);

      const result = await scanPublicationTree(await treeWithDirectory(segment));
      expect(result.ok).toBe(false);
      if (result.ok) return;

      // Asserted as the EXACT diagnostic set, not `toContain`: the sole rejection is the
      // path rule, at exactly the path whose directory is the segment under test. A bare
      // `ok === false` would prove almost nothing here, since a content match, an
      // oversized file, or a containment failure each produce it too.
      expect(result.diagnostics.map(({ code }) => code)).toEqual(['PUBLICATION_PATH_001']);
      expect(result.diagnostics[0]?.location.file).toBe(`files/${segment}/${benignBasename}`);
      expect(result.diagnostics[0]?.severity).toBe('error');
    });
  });
});
