import { runPipeline } from './run-pipeline.mjs';

await runPipeline(['format:check', 'lint', 'typecheck', 'policy:check', 'test:bootstrap']);
