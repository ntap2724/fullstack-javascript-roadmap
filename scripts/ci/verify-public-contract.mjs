import { runPipeline } from '../run-pipeline.mjs';

await runPipeline([
  'environment:verify',
  'check',
  'test',
  'content:validate:curriculum',
  'docs:build',
  'verify:negative-fixtures',
  'verify:templates',
]);
