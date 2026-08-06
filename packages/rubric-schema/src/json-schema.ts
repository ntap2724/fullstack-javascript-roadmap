import { z } from 'zod';
import { RubricSchema } from './schema.js';

export function generateRubricJsonSchema(): object {
  const schema: unknown = z.toJSONSchema(RubricSchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    throw new Error('Expected rubric JSON Schema generation to return a plain object');
  }

  return {
    ...schema,
    $comment:
      'Draft 2020-12 cannot express uniqueness of criteria[].id across distinct objects. This schema provides structural prevalidation only; every supported consumer must also parse the rubric with RubricSchema.',
  };
}
