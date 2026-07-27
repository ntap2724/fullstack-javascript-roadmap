import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const requiredFiles = [
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  'README.md',
  'docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md',
];

test('required greenfield repository files exist', async () => {
  await Promise.all(requiredFiles.map((file) => access(file)));
});

test('the written specification is marked approved and greenfield', async () => {
  const specification = await readFile(
    'docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md',
    'utf8',
  );
  assert.match(specification, /\*\*Status:\*\* Approved/);
  assert.match(specification, /Greenfield repository/);
});
