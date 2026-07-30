import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './run-pipeline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const publishedRoute = path.join(
  root,
  'apps/docs/dist/lessons/javascript/functions/closure-private-state/index.html',
);
const draftRoute = path.join(root, 'apps/docs/dist/lessons/release-zero/draft/index.html');
const localCopy = path.join(root, 'apps/docs/src/content/docs');

async function assertPathAbsent(candidate, label) {
  try {
    await access(candidate);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  throw new Error(`${label} unexpectedly exists: ${candidate}`);
}

await runPipeline(
  ['check', 'test', 'content:validate:curriculum', 'schema:check', 'docs:test:e2e'],
  { cwd: root },
);

await access(publishedRoute);
const publishedHtml = await readFile(publishedRoute, 'utf8');
if (!publishedHtml.includes('RELEASE_ZERO_CLOSURE_BODY')) {
  throw new Error('Published route artifact does not contain rendered curriculum body');
}
await assertPathAbsent(draftRoute, 'Draft route artifact');
await assertPathAbsent(localCopy, 'Hand-maintained docs copy');
