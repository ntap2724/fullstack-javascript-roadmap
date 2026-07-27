import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => readFile(path, 'utf8');

test('engineering issue form requires scope, risk, acceptance, commands, and evidence', async () => {
  const form = await read('.github/ISSUE_TEMPLATE/engineering.yml');
  for (const label of [
    'In scope',
    'Out of scope',
    'Risk level',
    'Acceptance criteria',
    'Commands',
    'Evidence',
  ]) {
    assert.match(form, new RegExp(label, 'i'));
  }
});

test('pull request template distinguishes implementation from verification', async () => {
  const template = await read('.github/pull_request_template.md');
  assert.match(template, /Implementation status/);
  assert.match(template, /Verification evidence/);
  assert.match(template, /Unverified areas/);
});
