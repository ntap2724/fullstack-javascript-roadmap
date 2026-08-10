import { ESLint } from 'eslint';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { getFileInfo } from 'prettier';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const eslint = new ESLint({ cwd: process.cwd() });

function severityOf(ruleSetting) {
  if (Array.isArray(ruleSetting)) return ruleSetting[0];
  return ruleSetting ?? 0;
}

async function ensureDirectory(directoryPath, ownedDirectories) {
  try {
    const metadata = await stat(directoryPath);

    if (!metadata.isDirectory()) {
      throw new Error(`Expected a directory at ${directoryPath}`);
    }

    return;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  try {
    await mkdir(directoryPath);
    ownedDirectories.push(directoryPath);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;

    const metadata = await stat(directoryPath);

    if (!metadata.isDirectory()) {
      throw new Error(`Expected a directory at ${directoryPath}`, { cause: error });
    }
  }
}

async function removeOwnedDirectoryIfEmpty(directoryPath) {
  try {
    await rmdir(directoryPath);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTEMPTY') return;
    throw error;
  }
}

async function withTemporarySddArtifact(rootDirectory, prefix, callback) {
  const superpowersDirectory = path.join(rootDirectory, '.superpowers');
  const sddDirectory = path.join(superpowersDirectory, 'sdd');
  const ownedDirectories = [];
  let temporaryDirectory;

  try {
    await ensureDirectory(superpowersDirectory, ownedDirectories);
    await ensureDirectory(sddDirectory, ownedDirectories);

    temporaryDirectory = await mkdtemp(path.join(sddDirectory, prefix));

    const generatedArtifact = path.join(temporaryDirectory, `generated-${randomUUID()}.md`);
    await writeFile(generatedArtifact, '# generated Prettier regression artifact\n');
    return await callback(generatedArtifact);
  } finally {
    if (temporaryDirectory !== undefined) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }

    for (let index = ownedDirectories.length - 1; index >= 0; index -= 1) {
      await removeOwnedDirectoryIfEmpty(ownedDirectories[index]);
    }
  }
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
  // Exact deepEqual, deliberately: this is a LOCK on the root program's contents.
  // It must fail if the include list changes unannounced, so relaxing it to a
  // substring, length, or .includes() check is refused. scripts/verify-all-templates.ts
  // was added under Owner ruling R5 so that pnpm typecheck genuinely covers it.
  assert.deepEqual(config.include, [
    'vitest.config.ts',
    'scripts/generate-json-schema.ts',
    'scripts/verify-all-templates.ts',
  ]);
});

test('root scripts expose check and domain-aware tests', async () => {
  const packageJson = await readJson('package.json');
  assert.equal(typeof packageJson.scripts.check, 'string');
  assert.equal(packageJson.scripts['test:bootstrap'], 'node --test scripts/*.test.mjs');
  assert.equal(
    packageJson.scripts['test:wp-00-01-gate'],
    'node --test scripts/wp-00-01-gate.integration.mjs',
  );
  assert.equal(packageJson.scripts['test:unit'], 'vitest run');
  assert.equal(packageJson.scripts.test, 'node scripts/run-pipeline.mjs test:bootstrap test:unit');
});

test('Prettier ownership excludes only root governance and generated-state boundaries', async () => {
  await withTemporarySddArtifact(
    process.cwd(),
    'prettier-regression-',
    async (generatedArtifact) => {
      const cases = [
        ['docs/superpowers/specs/2026-07-26-fullstack-javascript-roadmap-design.md', true],
        ['docs/superpowers/plans/2026-07-26-wp-00-01-bootstrap-governance.md', true],
        ['pnpm-lock.yaml', true],
        [generatedArtifact, true],
        ['packages/curriculum-schema/generated/curriculum.schema.json', true],
        ['scripts/pin-toolchain.mjs', false],
        ['scripts/toolchain.test.mjs', false],
        ['eslint.config.mjs', false],
      ];

      for (const [filePath, expectedIgnored] of cases) {
        const info = await getFileInfo(filePath, {
          ignorePath: path.resolve('.prettierignore'),
        });
        assert.equal(info.ignored, expectedIgnored, filePath);
      }
    },
  );
});

test('Astro generated state is excluded from Git, Prettier, and ESLint ownership', async () => {
  const generatedArtifact = 'apps/docs/.astro/content.d.ts';
  const gitResult = spawnSync(
    'git',
    ['check-ignore', '--no-index', '--verbose', '--', generatedArtifact],
    {
      encoding: 'utf8',
      shell: false,
      windowsHide: process.platform === 'win32',
    },
  );

  assert.ifError(gitResult.error);
  assert.equal(gitResult.status, 0, `${gitResult.stdout}\n${gitResult.stderr}`);
  assert.match(gitResult.stdout, /^\.gitignore:.*apps\/docs\/\.astro\/content\.d\.ts\s*$/m);

  const prettierInfo = await getFileInfo(generatedArtifact, {
    ignorePath: path.resolve('.gitignore'),
  });
  assert.equal(prettierInfo.ignored, true);
  assert.equal(await eslint.isPathIgnored(generatedArtifact), true);
});

test('temporary SDD fixtures own only paths they create', async () => {
  const syntheticRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-sdd-fixture-'));
  const superpowersDirectory = path.join(syntheticRoot, '.superpowers');
  const sddDirectory = path.join(superpowersDirectory, 'sdd');

  try {
    await assert.rejects(stat(superpowersDirectory), { code: 'ENOENT' });
    await assert.rejects(stat(sddDirectory), { code: 'ENOENT' });

    let generatedArtifact;

    await withTemporarySddArtifact(syntheticRoot, 'missing-parents-', async (artifactPath) => {
      generatedArtifact = artifactPath;
      assert.equal((await stat(superpowersDirectory)).isDirectory(), true);
      assert.equal((await stat(sddDirectory)).isDirectory(), true);
      assert.equal((await stat(artifactPath)).isFile(), true);
    });

    await assert.rejects(stat(generatedArtifact), { code: 'ENOENT' });
    await assert.rejects(stat(sddDirectory), { code: 'ENOENT' });
    await assert.rejects(stat(superpowersDirectory), { code: 'ENOENT' });

    let callbackFailureArtifact;

    await assert.rejects(
      withTemporarySddArtifact(syntheticRoot, 'callback-failure-', async (artifactPath) => {
        callbackFailureArtifact = artifactPath;
        throw new Error('fixture callback failure');
      }),
      /fixture callback failure/,
    );

    await assert.rejects(stat(callbackFailureArtifact), { code: 'ENOENT' });
    await assert.rejects(stat(sddDirectory), { code: 'ENOENT' });
    await assert.rejects(stat(superpowersDirectory), { code: 'ENOENT' });

    await mkdir(superpowersDirectory);
    await mkdir(sddDirectory);

    const sentinelPath = path.join(superpowersDirectory, 'sentinel.txt');
    const sentinelBytes = Buffer.from([0x00, 0x7f, 0xff, 0x0a]);
    await writeFile(sentinelPath, sentinelBytes);

    await withTemporarySddArtifact(syntheticRoot, 'existing-parents-', async (artifactPath) => {
      assert.equal((await stat(artifactPath)).isFile(), true);
    });

    assert.equal((await stat(superpowersDirectory)).isDirectory(), true);
    assert.equal((await stat(sddDirectory)).isDirectory(), true);
    assert.deepEqual(await readFile(sentinelPath), sentinelBytes);
  } finally {
    await rm(syntheticRoot, { recursive: true, force: true });
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
