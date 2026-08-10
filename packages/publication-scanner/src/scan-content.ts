import type { Diagnostic } from '@roadmap/validation-core';
import { contentPolicies } from './policies.js';

/**
 * Largest file the Release 0 scanner will decode and inspect. Anything larger is
 * rejected rather than skipped, so an oversized payload cannot pass unexamined.
 */
export const MAX_SCANNABLE_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Matches content policies against a file's bytes.
 *
 * NUL bytes guard the DECODE step only, never detection (INV-F1, Owner ruling R11).
 * The governed plan text read `if (bytes.includes(0)) return []`, which meant a single
 * prepended NUL disabled all six content policies while every secret byte remained in
 * the file — a bypass reproduced as OWNER-F1. NUL bytes are now removed before decoding,
 * so binary input still cannot produce meaningless UTF-8 matches, but a secret embedded
 * in a NUL-bearing file is still found.
 *
 * `observed` deliberately records the pattern that matched and never the matched text,
 * so a real secret is not copied into diagnostics, logs, or CI output.
 */
export function contentDiagnostics(relativePath: string, bytes: Uint8Array): readonly Diagnostic[] {
  const text = Buffer.from(bytes.filter((byte) => byte !== 0)).toString('utf8');
  return contentPolicies.flatMap((policy) =>
    policy.pattern.test(text)
      ? [
          {
            code: policy.code,
            severity: 'error' as const,
            location: { file: relativePath },
            observed: policy.pattern.source,
            expected: 'No private marker, internal location, or known secret pattern',
            reason: 'Publication content matched a prohibited pattern',
            remediation:
              'Remove the sensitive value, rotate it if real, and retain only a non-secret example',
            documentation: 'docs/maintainers/template-publication.md',
          },
        ]
      : [],
  );
}
