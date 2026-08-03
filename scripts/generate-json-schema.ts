import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { generateCurriculumJsonSchema } from '../packages/curriculum-schema/src/json-schema.js';
import { generateEvidenceManifestJsonSchema } from '../packages/evidence-schema/src/json-schema.js';
import { generateRubricJsonSchema } from '../packages/rubric-schema/src/json-schema.js';

const curriculumOutput = new URL(
  '../packages/curriculum-schema/generated/curriculum.schema.json',
  import.meta.url,
);
const rubricOutput = new URL(
  '../packages/rubric-schema/generated/rubric.schema.json',
  import.meta.url,
);
const evidenceOutput = new URL(
  '../packages/evidence-schema/generated/evidence-manifest.schema.json',
  import.meta.url,
);
const rubricDirectory = new URL('../packages/rubric-schema/generated/', import.meta.url);
const evidenceDirectory = new URL('../packages/evidence-schema/generated/', import.meta.url);
const curriculumSchema = generateCurriculumJsonSchema();
const rubricSchema = generateRubricJsonSchema();
const evidenceSchema = generateEvidenceManifestJsonSchema();
const rubricOutputPath = fileURLToPath(rubricOutput);
const rubricFormattingOptions = (await resolveConfig(rubricOutputPath)) ?? {};
const formattedRubricSchema = await format(JSON.stringify(rubricSchema, null, 2), {
  ...rubricFormattingOptions,
  filepath: rubricOutputPath,
});
const evidenceOutputPath = fileURLToPath(evidenceOutput);
const evidenceFormattingOptions = (await resolveConfig(evidenceOutputPath)) ?? {};
const formattedEvidenceSchema = await format(JSON.stringify(evidenceSchema, null, 2), {
  ...evidenceFormattingOptions,
  filepath: evidenceOutputPath,
});

await mkdir(rubricDirectory, { recursive: true });
await mkdir(evidenceDirectory, { recursive: true });
await Promise.all([
  writeFile(curriculumOutput, `${JSON.stringify(curriculumSchema, null, 2)}\n`),
  writeFile(rubricOutput, formattedRubricSchema),
  writeFile(evidenceOutput, formattedEvidenceSchema),
]);
