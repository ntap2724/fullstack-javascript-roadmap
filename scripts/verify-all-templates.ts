import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runTemplateDryRun } from '../tooling/publish-templates/src/pipeline.js';

const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' }).trim();

// Release evidence must describe a committed state. A dirty worktree means the
// bytes that were scanned, materialized, and verified are not the bytes any
// reviewer can retrieve from the source commit recorded in provenance, so the run
// is refused before it can produce misleading evidence.
const dirty = git('status', '--porcelain');
if (dirty.length > 0) throw new Error('TEMPLATE_RELEASE_001: worktree must be clean');

const sourceCommit = git('rev-parse', 'HEAD');
const nodeVersion = (await readFile('.node-version', 'utf8')).trim();
const pnpmVersion = (await readFile('.pnpm-version', 'utf8')).trim();
const templateRoots = ['templates/javascript-engineering'];

for (const templateRoot of templateRoots) {
  const outputRoot = await mkdtemp(path.join(tmpdir(), 'roadmap-template-'));
  const report = await runTemplateDryRun({
    templateRoot,
    outputRoot,
    sourceRepository: 'fullstack-javascript-roadmap',
    sourceCommit,
    generatedAt: new Date().toISOString(),
    nodeVersion,
    pnpmVersion,
  });
  if (report.status !== 'passed') {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }

  const reportPath = path.join(
    '.tmp',
    'reports',
    'templates',
    `${path.basename(templateRoot)}.json`,
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        status: 'passed',
        sourceCommit,
        templateId: path.basename(templateRoot),
        functionalSha256: report.artifact?.functionalSha256,
        diagnostics: report.diagnostics,
      },
      null,
      2,
    )}\n`,
  );
}
