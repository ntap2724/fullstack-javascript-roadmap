import { writeFile } from 'node:fs/promises';
import { generateCurriculumJsonSchema } from '../packages/curriculum-schema/src/json-schema.js';

const output = new URL(
  '../packages/curriculum-schema/generated/curriculum.schema.json',
  import.meta.url,
);
const schema = generateCurriculumJsonSchema();
await writeFile(output, `${JSON.stringify(schema, null, 2)}\n`);
