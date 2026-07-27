import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(path, 'utf8');

test('root governance defines verification and prohibited shortcuts', async () => {
  const root = await read('AGENTS.md');
  assert.match(root, /implemented.*verified/is);
  assert.match(root, /Do not delete, skip, or weaken failing tests/i);
  assert.match(root, /Do not change acceptance criteria after implementation/i);
  assert.match(root, /pnpm verify/);
});

test('template governance requires allowlist and independent verification', async () => {
  const templates = await read('templates/AGENTS.md');
  assert.match(templates, /allowlist/i);
  assert.match(templates, /outside the monorepo/i);
  assert.match(templates, /solution/i);
});
