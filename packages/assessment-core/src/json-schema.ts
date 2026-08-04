import { z } from 'zod';
import { RemediationCatalogSchema } from './remediation.js';

export function generateRemediationCatalogJsonSchema(): object {
  const schema: unknown = z.toJSONSchema(RemediationCatalogSchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error('Expected remediation catalog JSON Schema generation to return a plain object');
  }

  return {
    ...schema,
    $comment:
      'Draft 2020-12 cannot express uniqueness of entries[].criterion across distinct objects. This schema provides structural prevalidation only; every supported consumer must also parse the catalog with RemediationCatalogSchema.',
  };
}
