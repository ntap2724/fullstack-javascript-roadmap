import assert from 'node:assert/strict';
import test from 'node:test';
import { createCounter } from '../src/counter.js';

test('starter exports createCounter', () => {
  assert.equal(typeof createCounter, 'function');
});
