import path from 'node:path';
import { runCommand, type CommandResult } from '@roadmap/command-runner';
import type { PublicationArtifact } from '@roadmap/template-builder';
import type { TemplateDefinition } from '@roadmap/template-contract';
import type { Diagnostic } from '@roadmap/validation-core';

export interface TemplateVerificationReport {
  templateId: string;
  artifactRoot: string;
  status: 'passed' | 'failed' | 'internal-error';
  commands: readonly CommandResult[];
  diagnostics: readonly Diagnostic[];
}

function resolveArtifactDirectory(root: string, relative: string): string {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relative);
  const relation = path.relative(absoluteRoot, candidate);
  if (relation.startsWith('..') || path.isAbsolute(relation)) {
    throw new Error(`Verification cwd escapes artifact root: ${relative}`);
  }
  return candidate;
}

export async function verifyGeneratedTemplate(
  definition: TemplateDefinition,
  artifact: PublicationArtifact,
): Promise<TemplateVerificationReport> {
  const commands: CommandResult[] = [];
  const diagnostics: Diagnostic[] = [];
  const ordered = [
    ['install', definition.verification.install],
    ['baseline', definition.verification.baseline],
  ] as const;

  try {
    for (const [id, command] of ordered) {
      const result = await runCommand({
        ...command,
        cwd: resolveArtifactDirectory(artifact.root, command.cwd),
      });
      commands.push(result);
      if (result.exitCode !== 0 || result.timedOut) {
        diagnostics.push({
          code: 'TEMPLATE_VERIFY_001',
          severity: 'error',
          location: { file: artifact.root, pointer: `/verification/${id}` },
          observed: { exitCode: result.exitCode, timedOut: result.timedOut, stderr: result.stderr },
          expected: `${id} exits 0 before its timeout`,
          reason: 'Generated starter failed independent verification',
          remediation: `Run ${command.command} ${command.args.join(' ')} inside the generated artifact and fix the source template`,
          documentation: 'docs/maintainers/template-publication.md',
        });
        return {
          templateId: definition.id,
          artifactRoot: artifact.root,
          status: 'failed',
          commands,
          diagnostics,
        };
      }
    }
    return {
      templateId: definition.id,
      artifactRoot: artifact.root,
      status: 'passed',
      commands,
      diagnostics,
    };
  } catch (error) {
    return {
      templateId: definition.id,
      artifactRoot: artifact.root,
      status: 'internal-error',
      commands,
      diagnostics: [
        {
          code: 'TEMPLATE_VERIFY_999',
          severity: 'error',
          location: { file: artifact.root },
          observed: error instanceof Error ? error.message : String(error),
          expected: 'Independent verifier completes normally inside the artifact root',
          reason: 'The generated-template verifier crashed',
          remediation: 'Block publication and inspect the verifier exception',
          documentation: 'docs/maintainers/template-publication.md',
        },
      ],
    };
  }
}
