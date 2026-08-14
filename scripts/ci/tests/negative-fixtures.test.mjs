import test from 'node:test';
import assert from 'node:assert/strict';
import { runNegativeFixture } from '../run-negative-fixtures.mjs';

test('accepts a non-zero process with the exact declared diagnostic', async () => {
  const result = await runNegativeFixture(
    {
      id: 'expected',
      command: process.execPath,
      args: [
        '--input-type=module',
        '--eval',
        "console.log(JSON.stringify({diagnostics:[{code:'EXPECTED_001'}]})); process.exit(1)",
      ],
      expectedDiagnostic: 'EXPECTED_001',
    },
    process.cwd(),
  );
  assert.equal(result.status, 'passed');
});

test('rejects a fixture that exits zero', async () => {
  await assert.rejects(
    () =>
      runNegativeFixture(
        {
          id: 'false-pass',
          command: process.execPath,
          args: ['--eval', 'process.exit(0)'],
          expectedDiagnostic: 'EXPECTED_001',
        },
        process.cwd(),
      ),
    /unexpectedly passed/,
  );
});

test('rejects a non-zero process that emits a different diagnostic', async () => {
  await assert.rejects(
    () =>
      runNegativeFixture(
        {
          id: 'wrong-code',
          command: process.execPath,
          args: [
            '--input-type=module',
            '--eval',
            "console.log(JSON.stringify({diagnostics:[{code:'OTHER_001'}]})); process.exit(1)",
          ],
          expectedDiagnostic: 'EXPECTED_001',
        },
        process.cwd(),
      ),
    /without EXPECTED_001/,
  );
});
