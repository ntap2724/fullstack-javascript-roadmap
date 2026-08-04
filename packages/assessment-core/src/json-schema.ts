import { z } from 'zod';
import { RemediationCatalogSchema } from './remediation.js';

export function generateRemediationCatalogJsonSchema(): object {
  return z.toJSONSchema(RemediationCatalogSchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
}
