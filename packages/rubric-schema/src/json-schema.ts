import { z } from 'zod';
import { RubricSchema } from './schema.js';

export function generateRubricJsonSchema(): object {
  return z.toJSONSchema(RubricSchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
}
