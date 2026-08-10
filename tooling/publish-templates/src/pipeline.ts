import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  loadTemplateDefinition,
  materializeTemplate,
  selectPublicationFiles,
  type PublicationArtifact,
} from '@roadmap/template-builder';
import { scanPublicationFiles, scanPublicationTree } from '@roadmap/publication-scanner';
import {
  verifyGeneratedTemplate,
  type TemplateVerificationReport,
} from '@roadmap/template-verifier';
import type { Diagnostic } from '@roadmap/validation-core';

export interface TemplateDryRunOptions {
  templateRoot: string;
  outputRoot: string;
  sourceRepository: string;
  sourceCommit: string;
  generatedAt: string;
  nodeVersion: string;
  pnpmVersion: string;
}

export interface TemplateDryRunReport {
  status: 'passed' | 'failed';
  artifact?: PublicationArtifact;
  verification?: TemplateVerificationReport;
  diagnostics: readonly Diagnostic[];
}

export interface TemplateDryRunDependencies {
  loadTemplateDefinition: typeof loadTemplateDefinition;
  selectPublicationFiles: typeof selectPublicationFiles;
  scanPublicationFiles: typeof scanPublicationFiles;
  materializeTemplate: typeof materializeTemplate;
  scanPublicationTree: typeof scanPublicationTree;
  verifyGeneratedTemplate: typeof verifyGeneratedTemplate;
}

const defaults: TemplateDryRunDependencies = {
  loadTemplateDefinition,
  selectPublicationFiles,
  scanPublicationFiles,
  materializeTemplate,
  scanPublicationTree,
  verifyGeneratedTemplate,
};

/**
 * Compares the generated file set against the reviewed fixture. A malformed or
 * missing fixture throws, which the caller converts into TEMPLATE_PIPELINE_999:
 * an unreadable expectation must block publication rather than be treated as
 * "nothing to compare".
 */
async function expectedFileSetDiagnostics(
  templateRoot: string,
  artifact: PublicationArtifact,
): Promise<readonly Diagnostic[]> {
  const fixturePath = path.join(templateRoot, 'publication-tests', 'expected-files.json');
  const expected: unknown = JSON.parse(await readFile(fixturePath, 'utf8'));
  if (!Array.isArray(expected) || expected.some((entry) => typeof entry !== 'string')) {
    throw new Error(`Invalid expected file fixture: ${fixturePath}`);
  }
  const actual = artifact.files.map((file) => file.path).sort();
  const normalizedExpected = [...(expected as string[])].sort();
  return JSON.stringify(actual) === JSON.stringify(normalizedExpected)
    ? []
    : [
        {
          code: 'TEMPLATE_FILESET_001',
          severity: 'error',
          location: { file: fixturePath },
          // DEPARTURE from plan line 1865, under Owner ruling R6 (defect D14).
          // The plan assigns `expected: normalizedExpected` (string[]) to a field
          // declared `expected: string` in validation-core, which cannot compile.
          // Both file lists are preserved here as structured data — the exit gate
          // requires the generated file list as evidence, and a consumer must still
          // be able to diff the two sets programmatically — while `expected` carries
          // the prose sentence every shipped diagnostic uses.
          observed: { actual, expected: normalizedExpected },
          expected: 'The generated file set recorded in publication-tests/expected-files.json',
          reason: 'Generated file set differs from the reviewed publication fixture',
          remediation:
            'Review the generated diff and update source plus expected-files.json in one PR',
          documentation: 'docs/maintainers/template-publication.md',
        },
      ];
}

/**
 * Composes the publication pipeline in a fixed, fail-closed order:
 *
 *   load -> select -> scan SOURCE -> materialize -> scan OUTPUT -> file set -> verify
 *
 * The ordering is the security property. Both scans and the reviewed-file-set
 * comparison complete before `verifyGeneratedTemplate` runs any command inside the
 * generated repository, so a leaking template never reaches command execution.
 * Every failure returns a report; nothing throws past this boundary.
 */
export async function runTemplateDryRun(
  options: TemplateDryRunOptions,
  overrides: Partial<TemplateDryRunDependencies> = {},
): Promise<TemplateDryRunReport> {
  const dependencies = { ...defaults, ...overrides };
  try {
    const { definition } = await dependencies.loadTemplateDefinition(options.templateRoot);
    const selected = await dependencies.selectPublicationFiles(options.templateRoot, definition);
    const sourceScan = await dependencies.scanPublicationFiles(options.templateRoot, selected);
    if (!sourceScan.ok) return { status: 'failed', diagnostics: sourceScan.diagnostics };

    const built = await dependencies.materializeTemplate(options.templateRoot, options.outputRoot, {
      schemaVersion: 1,
      templateId: definition.id,
      templateVersion: definition.version,
      curriculumVersion: definition.curriculum.release,
      sourceRepository: options.sourceRepository,
      sourceCommit: options.sourceCommit,
      generatedAt: options.generatedAt,
      toolchain: { node: options.nodeVersion, pnpm: options.pnpmVersion },
      contractVersions: { exercise: 1, rubric: 1, evidence: 1, template: 1 },
    });
    if (!built.ok) return { status: 'failed', diagnostics: built.diagnostics };

    const outputScan = await dependencies.scanPublicationTree(built.value.root);
    if (!outputScan.ok) {
      return { status: 'failed', artifact: built.value, diagnostics: outputScan.diagnostics };
    }

    const fileSetDiagnostics = await expectedFileSetDiagnostics(options.templateRoot, built.value);
    if (fileSetDiagnostics.length > 0) {
      return { status: 'failed', artifact: built.value, diagnostics: fileSetDiagnostics };
    }

    const verification = await dependencies.verifyGeneratedTemplate(definition, built.value);
    return {
      status: verification.status === 'passed' ? 'passed' : 'failed',
      artifact: built.value,
      verification,
      diagnostics: verification.diagnostics,
    };
  } catch (error) {
    return {
      status: 'failed',
      diagnostics: [
        {
          code: 'TEMPLATE_PIPELINE_999',
          severity: 'error',
          location: { file: options.templateRoot },
          observed: error instanceof Error ? error.message : String(error),
          expected: 'Dry-run pipeline completes with all required evidence',
          reason: 'The template dry-run pipeline crashed',
          remediation: 'Block publication and repair the reported pipeline failure',
          documentation: 'docs/maintainers/template-publication.md',
        },
      ],
    };
  }
}
