import path from 'node:path';
import type { Diagnostic } from '@roadmap/validation-core';
import { forbiddenBasenames, forbiddenPathSegments } from './policies.js';

/**
 * Inspects a normalized relative path for forbidden segments and basenames.
 * Segments are compared at every depth and case-insensitively: a forbidden
 * directory nested five levels down is exactly as dangerous as one at the root.
 */
export function pathDiagnostic(relativePath: string): Diagnostic | null {
  const segments = relativePath.split('/').map((segment) => segment.toLowerCase());
  const basename = path.basename(relativePath).toLowerCase();
  if (
    segments.some((segment) => forbiddenPathSegments.has(segment)) ||
    forbiddenBasenames.has(basename)
  ) {
    return {
      code: 'PUBLICATION_PATH_001',
      severity: 'error',
      location: { file: relativePath },
      observed: relativePath,
      expected:
        'A public learner file with no solution, private-fixture, answer, or credential path',
      reason: 'The selected path is prohibited from public starter output',
      remediation: 'Remove the path from files/ and keep it outside the publication allowlist',
      documentation: 'docs/maintainers/template-publication.md',
    };
  }
  return null;
}
