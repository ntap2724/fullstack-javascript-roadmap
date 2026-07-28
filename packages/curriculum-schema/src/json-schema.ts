import { z } from 'zod';
import { CurriculumEntitySchema } from './entities.js';

export function generateCurriculumJsonSchema(): object {
  return z.toJSONSchema(CurriculumEntitySchema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw',
  });
}
