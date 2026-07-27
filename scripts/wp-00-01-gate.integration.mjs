import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

test('WP-00–01 gate command succeeds', () => {
  const result = spawnSync('node', ['scripts/verify-wp-00-01.mjs'], {
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
