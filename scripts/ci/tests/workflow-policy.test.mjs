import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';

async function workflows() {
  const directory = '.github/workflows';
  const names = (await readdir(directory)).filter((name) => name.endsWith('.yml'));
  return Promise.all(
    names.map(async (name) => ({
      name,
      value: parse(await readFile(`${directory}/${name}`, 'utf8')),
    })),
  );
}

function serialized(value) {
  return JSON.stringify(value);
}

test('all workflows are read-only and avoid unsafe triggers or commands', async () => {
  for (const { name, value } of await workflows()) {
    assert.equal(value.permissions?.contents, 'read', name);
    assert.equal(value.on?.pull_request_target, undefined, name);
    const text = serialized(value);
    assert.doesNotMatch(text, /continue-on-error|(?<!p)npm install|pnpm add|curl[^\n]*\|/i, name);
    assert.doesNotMatch(
      text,
      /contents.{0,20}write|pages.{0,20}write|id-token.{0,20}write|packages.{0,20}write/i,
      name,
    );
    assert.doesNotMatch(text, /secrets\.|git push|gh release|npm publish/i, name);
  }
});

test('pull requests use fixed runners, frozen install, and non-persistent checkout credentials', async () => {
  const value = parse(await readFile('.github/workflows/pull-request.yml', 'utf8'));
  assert.deepEqual(value.jobs.verify.strategy.matrix.os, ['ubuntu-24.04', 'windows-2025']);
  assert.equal(value.jobs.verify['timeout-minutes'], 30);
  const steps = value.jobs.verify.steps;
  assert.equal(
    steps.find((step) => step.uses === 'actions/checkout@v6').with['persist-credentials'],
    false,
  );
  assert.ok(steps.some((step) => step.run === 'pnpm install --frozen-lockfile'));
  assert.ok(steps.some((step) => step.run === 'pnpm verify'));
});
