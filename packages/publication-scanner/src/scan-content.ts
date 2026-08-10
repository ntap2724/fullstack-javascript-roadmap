import type { Diagnostic } from '@roadmap/validation-core';
import { contentPolicies } from './policies.js';

/**
 * Largest file the Release 0 scanner will decode and inspect. Anything larger is
 * rejected rather than skipped, so an oversized payload cannot pass unexamined.
 */
export const MAX_SCANNABLE_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Matches content policies against a file's bytes. Files containing a NUL byte are
 * treated as binary and skipped: decoding them as UTF-8 would produce replacement
 * characters and meaningless matches. `observed` deliberately records the pattern
 * that matched and never the matched text, so a real secret is not copied into
 * diagnostics, logs, or CI output.
 */
export function contentDiagnostics(relativePath: string, bytes: Uint8Array): readonly Diagnostic[] {
  if (bytes.includes(0)) return [];
  const text = Buffer.from(bytes).toString('utf8');
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
