import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../../src/counter.js';

test('each counter preserves independent private state', () => {
  const first = createCounter();
  const second = createCounter();
  for (let expected = 1; expected <= 10; expected += 1) {
    assert.equal(first(), expected);
  }
  assert.equal(second(), 1);
});
