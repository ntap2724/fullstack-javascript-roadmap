import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import { getFileInfo } from 'prettier';
import test from 'node:test';
import assert from 'node:assert/strict';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const eslint = new ESLint({ cwd: process.cwd() });

function severityOf(ruleSetting) {
  if (Array.isArray(ruleSetting)) return ruleSetting[0];
  return ruleSetting ?? 0;
}

test('TypeScript base config is strict and emits no build artifacts', async () => {
  const config = await readJson('tsconfig.base.json');
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.noEmit, true);
  assert.equal(config.compilerOptions.module, 'NodeNext');
  assert.equal(config.compilerOptions.moduleResolution, 'NodeNext');
});

test('root compiler entry point extends the base contract', async () => {
  const config = await readJson('tsconfig.json');
  assert.equal(config.extends, './tsconfig.base.json');
  assert.deepEqual(config.include, ['vitest.config.ts']);
});

test('root scripts expose check and bootstrap tests', async () => {
  const packageJson = await readJson('package.json');
  assert.equal(typeof packageJson.scripts.check, 'string');
  assert.equal(packageJson.scripts.test, 'node --test scripts/*.test.mjs');
  assert.equal(packageJson.scripts['test:bootstrap'], 'node --test scripts/*.test.mjs');
});

test('Prettier ownership excludes only canonical governance docs and the root lockfile', async () => {
  const cases = [
    ['docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md', true],
    ['docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md', true],
    ['pnpm-lock.yaml', true],
    ['scripts/pin-toolchain.mjs', false],
    ['scripts/toolchain.test.mjs', false],
    ['eslint.config.mjs', false],
  ];

  for (const [filePath, expectedIgnored] of cases) {
    const info = await getFileInfo(filePath, {
      ignorePath: '.prettierignore',
    });
    assert.equal(info.ignored, expectedIgnored, filePath);
  }
});

test('globals is a direct dependency with exact catalog and lock resolution', async () => {
  const packageJson = await readJson('package.json');
  const workspace = await readFile('pnpm-workspace.yaml', 'utf8');
  const lockfile = await readFile('pnpm-lock.yaml', 'utf8');

  assert.equal(packageJson.devDependencies?.globals, 'catalog:');
  assert.match(workspace, /^ {2}globals: 17\.7\.0$/m);
  assert.match(
    lockfile,
    /importers:\r?\n\r?\n {2}\.:[\s\S]*?\n {6}globals:\r?\n {8}specifier: 'catalog:'\r?\n {8}version: 17\.7\.0(?:\r?\n|$)/,
  );
});

test('TypeScript keeps type-aware linting without CommonJS globals', async () => {
  const config = await eslint.calculateConfigForFile('vitest.config.ts');

  assert.equal(config.languageOptions.parserOptions.projectService, true);
  assert.equal(config.rules['@typescript-eslint/await-thenable'][0], 2);
  assert.equal(config.languageOptions.globals.require, undefined);
});

test('MJS and CJS lint without project-information parser failures', async () => {
  const [mjsResult] = await eslint.lintText('void 0;\n', {
    filePath: 'scripts/config-contract-fixture.mjs',
  });
  const [cjsResult] = await eslint.lintText('void 0;\n', {
    filePath: 'scripts/config-contract-fixture.cjs',
  });

  assert.equal(mjsResult.fatalErrorCount, 0);
  assert.equal(cjsResult.fatalErrorCount, 0);

  const mjsConfig = await eslint.calculateConfigForFile('scripts/config-contract-fixture.mjs');
  const cjsConfig = await eslint.calculateConfigForFile('scripts/config-contract-fixture.cjs');

  assert.equal(mjsConfig.languageOptions.parserOptions.projectService, false);
  assert.equal(cjsConfig.languageOptions.parserOptions.projectService, false);
});

test('strict TypeScript rules stop at the untyped JavaScript boundary', async () => {
  const [typescriptConfig, mjsConfig, cjsConfig] = await Promise.all([
    eslint.calculateConfigForFile('vitest.config.ts'),
    eslint.calculateConfigForFile('scripts/pin-toolchain.mjs'),
    eslint.calculateConfigForFile('scripts/config-contract-fixture.cjs'),
  ]);

  assert.equal(severityOf(typescriptConfig.rules['@typescript-eslint/no-dynamic-delete']), 2);
  assert.equal(severityOf(mjsConfig.rules['@typescript-eslint/no-dynamic-delete']), 0);
  assert.equal(severityOf(cjsConfig.rules['@typescript-eslint/no-dynamic-delete']), 0);
  assert.equal(severityOf(mjsConfig.rules['no-regex-spaces']), 2);
});

test('require is undefined in MJS and defined in CJS', async () => {
  const source = "require('node:fs');\n";
  const [mjsResult] = await eslint.lintText(source, {
    filePath: 'scripts/config-contract-fixture.mjs',
  });
  const [cjsResult] = await eslint.lintText(source, {
    filePath: 'scripts/config-contract-fixture.cjs',
  });

  const mjsRequireErrors = mjsResult.messages.filter(
    (message) => message.ruleId === 'no-undef' && message.message.includes("'require'"),
  );
  const cjsRequireErrors = cjsResult.messages.filter(
    (message) => message.ruleId === 'no-undef' && message.message.includes("'require'"),
  );

  assert.equal(mjsRequireErrors.length, 1);
  assert.equal(cjsRequireErrors.length, 0);
});
