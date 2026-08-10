/**
 * Publication policies, stated explicitly so a reviewer can audit the exact
 * denylist rather than infer it from scanning code.
 *
 * This scanner is defense in depth. It is NOT a claim of complete secret
 * detection: release credentials remain isolated and GitHub secret scanning
 * remains enabled separately. Known coverage gaps are recorded in
 * docs/maintainers/template-publication.md.
 */

/** Directory names that must never appear anywhere in a public starter path. */
export const forbiddenPathSegments = new Set([
  'solution',
  'solutions',
  'private-fixtures',
  'maintainer-tests',
  'answer-key',
  'internal-review',
]);

/** File names that must never be published, regardless of directory. */
export const forbiddenBasenames = new Set([
  '.env',
  '.npmrc',
  'id_rsa',
  'id_ed25519',
  'credentials.json',
]);

export interface ContentPolicy {
  readonly code: string;
  readonly pattern: RegExp;
}

export const contentPolicies: readonly ContentPolicy[] = [
  { code: 'PUBLICATION_CONTENT_001', pattern: /ROADMAP_MAINTAINER_ONLY|BEGIN_PRIVATE_FIXTURE/ },
  {
    code: 'PUBLICATION_INTERNAL_001',
    pattern: /https?:\/\/(?:github\.com\/[^/]+\/[^\s]+-private|internal\.[A-Za-z0-9.-]+)/i,
  },
  {
    code: 'PUBLICATION_INTERNAL_002',
    pattern: /(?:[A-Za-z]:\\Users\\[^\s]+|\/home\/[^\s]+|\/Users\/[^\s]+)/,
  },
  { code: 'PUBLICATION_SECRET_001', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { code: 'PUBLICATION_SECRET_002', pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { code: 'PUBLICATION_SECRET_003', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
];
