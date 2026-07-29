import { runPipeline } from './run-pipeline.mjs';

await runPipeline(['check', 'test', 'schema:check', 'content:validate:curriculum']);
