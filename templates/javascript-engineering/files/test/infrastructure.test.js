import assert from 'node:assert/strict';
import test from 'node:test';
import { greet } from '../src/index.js';

test('starter exports greet', () => {
  assert.equal(typeof greet, 'function');
});
