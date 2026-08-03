import { z } from 'zod';
import { EvidenceManifestSchema } from './schema.js';

export function generateEvidenceManifestJsonSchema(): object {
  return z.toJSONSchema(EvidenceManifestSchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
}
