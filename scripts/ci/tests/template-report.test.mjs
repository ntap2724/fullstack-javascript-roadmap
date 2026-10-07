import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const candidateScript = path.join(repoRoot, 'scripts', 'verify-all-templates.ts');
const tsxCli = require.resolve('tsx/cli');

// Every template the production script verifies, sorted exactly as readdir returns
// them. This stays an exhaustive whitelist: the guard's intent is that a run writes
// one report per verified template and nothing else, so adding a template here is a
// deliberate, reviewed act rather than a side effect of loosening the assertion.
const templateIds = ['fullstack-vertical-slice', 'javascript-engineering'];
const reportedTemplateId = 'javascript-engineering';
const functionalSha256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

async function writeGitObject(gitDirectory, type, body) {
  const payload = Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body]);
  const objectId = createHash('sha1').update(payload).digest('hex');
  const objectPath = path.join(gitDirectory, 'objects', objectId.slice(0, 2), objectId.slice(2));
  await mkdir(path.dirname(objectPath), { recursive: true });
  await writeFile(objectPath, deflateSync(payload));
  return objectId;
}

// The production entry point requires a clean Git worktree and a real HEAD.
// Build those read-only inputs entirely inside the owned scratch container so
// the regression test never creates a commit or ref in the repository under test.
async function createGitMetadata(scratch) {
  const gitDirectory = path.join(scratch, 'git-metadata');
  await mkdir(path.join(gitDirectory, 'refs', 'heads'), { recursive: true });
  const tree = await writeGitObject(gitDirectory, 'tree', Buffer.alloc(0));
  const identity = 'WP09 Test <wp09-test@example.invalid> 0 +0000';
  const commit = await writeGitObject(
    gitDirectory,
    'commit',
    Buffer.from(
      `tree ${tree}\nauthor ${identity}\ncommitter ${identity}\n\ntemplate report fixture\n`,
    ),
  );
  await writeFile(path.join(gitDirectory, 'HEAD'), `${commit}\n`);
  await writeFile(
    path.join(gitDirectory, 'config'),
    '[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n\tbare = false\n[status]\n\tshowUntrackedFiles = no\n',
  );
  return { gitDirectory, sourceCommit: commit };
}

async function createHarness(t, dryRunReport, staleReport) {
  const scratch = await mkdtemp(path.join(tmpdir(), 'roadmap-template-report-'));
  t.after(async () => {
    await rm(scratch, { recursive: true, force: true });
  });

  const root = path.join(scratch, 'repository');
  const scriptPath = path.join(root, 'scripts', 'verify-all-templates.ts');
  const pipelinePath = path.join(root, 'tooling', 'publish-templates', 'src', 'pipeline.js');
  const reportPath = path.join(root, '.tmp', 'reports', 'templates', `${reportedTemplateId}.json`);
  const childTemp = path.join(scratch, 'os-temp');
  await mkdir(root);
  await mkdir(path.dirname(scriptPath), { recursive: true });
  await mkdir(path.dirname(pipelinePath), { recursive: true });
  await mkdir(childTemp, { recursive: true });
  await copyFile(candidateScript, scriptPath);
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}\n');
  await writeFile(path.join(root, '.node-version'), '24\n');
  await writeFile(path.join(root, '.pnpm-version'), '11.9.0\n');
  await writeFile(
    pipelinePath,
    `export async function runTemplateDryRun() {\n  return ${JSON.stringify(dryRunReport, null, 2)};\n}\n`,
  );

  let staleText = null;
  if (staleReport) {
    staleText = `${JSON.stringify(staleReport, null, 2)}\n`;
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, staleText);
  }

  assert.deepEqual(
    await readFile(scriptPath),
    await readFile(candidateScript),
    'the harness must execute an exact byte copy of the production script',
  );

  const { gitDirectory, sourceCommit } = await createGitMetadata(scratch);

  return {
    root,
    scriptPath,
    reportPath,
    childTemp,
    gitDirectory,
    sourceCommit,
    staleText,
  };
}

function runTemplateVerifier(harness) {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  env.TEMP = harness.childTemp;
  env.TMP = harness.childTemp;
  env.TMPDIR = harness.childTemp;
  env.GIT_DIR = harness.gitDirectory;
  env.GIT_WORK_TREE = harness.root;
  env.GIT_OPTIONAL_LOCKS = '0';
  const result = spawnSync(process.execPath, [tsxCli, harness.scriptPath], {
    cwd: harness.root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    code: result.status,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

async function readReport(reportPath) {
  try {
    const text = await readFile(reportPath, 'utf8');
    return { text, value: JSON.parse(text) };
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function hasDiagnostic(report, code) {
  return (
    Array.isArray(report?.diagnostics) &&
    report.diagnostics.some((diagnostic) => diagnostic?.code === code)
  );
}

const failedDryRun = {
  status: 'failed',
  diagnostics: [{ code: 'SYNTHETIC_TEMPLATE_FAILURE' }],
};

test('failed template dry run exits non-zero without writing passing evidence', async (t) => {
  const harness = await createHarness(t, failedDryRun);
  const outcome = runTemplateVerifier(harness);
  const report = await readReport(harness.reportPath);

  assert.deepEqual(
    {
      exitCode: outcome.code,
      signal: outcome.signal,
      failureDiagnosticPrinted: outcome.stderr.includes('SYNTHETIC_TEMPLATE_FAILURE'),
      passingReportExists: report?.value?.status === 'passed',
      passingReportContainsFailure:
        report?.value?.status === 'passed' &&
        hasDiagnostic(report.value, 'SYNTHETIC_TEMPLATE_FAILURE'),
    },
    {
      exitCode: 1,
      signal: null,
      failureDiagnosticPrinted: true,
      passingReportExists: false,
      passingReportContainsFailure: false,
    },
  );
});

test('failed template dry run invalidates stale passing evidence for the same template', async (t) => {
  const staleReport = {
    schemaVersion: 1,
    status: 'passed',
    sourceCommit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    templateId: reportedTemplateId,
    functionalSha256,
    diagnostics: [],
  };
  const harness = await createHarness(t, failedDryRun, staleReport);
  const outcome = runTemplateVerifier(harness);
  const report = await readReport(harness.reportPath);

  assert.deepEqual(
    {
      exitCode: outcome.code,
      failureDiagnosticPrinted: outcome.stderr.includes('SYNTHETIC_TEMPLATE_FAILURE'),
      passingEvidenceRemains: report?.value?.status === 'passed',
      originalStaleBytesRemain: report?.text === harness.staleText,
    },
    {
      exitCode: 1,
      failureDiagnosticPrinted: true,
      passingEvidenceRemains: false,
      originalStaleBytesRemain: false,
    },
  );
});

test('successful template dry run writes exactly one declared passing report per template', async (t) => {
  const diagnostics = [{ code: 'SYNTHETIC_TEMPLATE_NOTICE' }];
  const harness = await createHarness(t, {
    status: 'passed',
    artifact: { functionalSha256 },
    diagnostics,
  });
  const outcome = runTemplateVerifier(harness);

  assert.deepEqual(
    {
      exitCode: outcome.code,
      signal: outcome.signal,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
    },
    { exitCode: 0, signal: null, stdout: '', stderr: '' },
  );

  // Exhaustive, deliberately: one report per verified template and nothing else.
  // A run that silently skipped a template, or emitted a stray file, must fail here.
  assert.deepEqual(
    await readdir(path.dirname(harness.reportPath)),
    templateIds.map((id) => `${id}.json`),
  );

  // Every report is checked byte-for-byte, so a template cannot be "verified" with
  // a report that omits or reshapes the declared evidence fields.
  for (const templateId of templateIds) {
    const reportPath = path.join(path.dirname(harness.reportPath), `${templateId}.json`);
    const report = await readReport(reportPath);
    const expected = {
      schemaVersion: 1,
      status: 'passed',
      sourceCommit: harness.sourceCommit,
      templateId,
      functionalSha256,
      diagnostics,
    };
    assert.equal(report?.text, `${JSON.stringify(expected, null, 2)}\n`, templateId);
  }
});
