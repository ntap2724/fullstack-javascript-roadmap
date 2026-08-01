import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../../src/counter.js';

test('counter instances preserve independent state', () => {
  const first = createCounter();
  const second = createCounter();
  assert.equal(first(), 1);
  assert.equal(first(), 2);
  assert.equal(second(), 1);
});
