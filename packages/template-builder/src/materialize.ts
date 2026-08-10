import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSafeRelativePath, normalizeRelativePath } from '@roadmap/exercise-contract';
import { TemplateProvenanceSchema, type TemplateProvenance } from '@roadmap/template-contract';
import { failure, success, type ValidationOutcome } from '@roadmap/validation-core';
import { applyTextTransforms } from './transforms.js';
import { buildPublicationArtifact, type PublicationArtifact } from './hash-artifact.js';
import { writeTemplateManifest } from './manifest.js';
import { loadTemplateDefinition, selectPublicationFiles } from './select-files.js';

const textNames = new Set(['.node-version', '.gitignore', '.env.example', 'AGENTS.md']);
const textExtensions = new Set([
  '.md',
  '.json',
  '.yaml',
  '.yml',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.html',
  '.css',
  '.txt',
]);

function targetPath(sourceRelativePath: string): string {
  if (!sourceRelativePath.startsWith('files/')) {
    throw new Error(`TEMPLATE_TARGET_001:${sourceRelativePath}`);
  }
  const target = normalizeRelativePath(sourceRelativePath.slice('files/'.length));
  if (!isSafeRelativePath(target)) throw new Error(`TEMPLATE_TARGET_002:${sourceRelativePath}`);
  return target;
}

function contains(parent: string, child: string): boolean {
  const relation = path.relative(parent, child);
  return relation === '' || (!relation.startsWith('..') && !path.isAbsolute(relation));
}

export async function materializeTemplate(
  sourceInput: string | URL,
  outputRoot: string,
  provenanceInput: TemplateProvenance,
): Promise<ValidationOutcome<PublicationArtifact>> {
  try {
    const { root, definition } = await loadTemplateDefinition(sourceInput);
    const provenance = TemplateProvenanceSchema.parse(provenanceInput);
    if (
      provenance.templateId !== definition.id ||
      provenance.templateVersion !== definition.version
    ) {
      throw new Error('TEMPLATE_PROVENANCE_001:definition and provenance versions differ');
    }
    const resolvedOutput = path.resolve(outputRoot);
    // Containment is checked before any destructive call so that a mis-pointed output
    // can never delete the source tree.
    if (contains(root, resolvedOutput) || contains(resolvedOutput, root)) {
      throw new Error(
        'TEMPLATE_OUTPUT_001:source and output directories must not contain one another',
      );
    }
    await rm(resolvedOutput, { recursive: true, force: true });
    await mkdir(resolvedOutput, { recursive: true });

    for (const sourceRelativePath of await selectPublicationFiles(root)) {
      const targetRelativePath = targetPath(sourceRelativePath);
      const sourceFile = path.join(root, sourceRelativePath);
      const targetFile = path.join(resolvedOutput, targetRelativePath);
      await mkdir(path.dirname(targetFile), { recursive: true });
      const bytes = await readFile(sourceFile);
      const basename = path.basename(targetRelativePath);
      const extension = path.extname(targetRelativePath);
      if (textNames.has(basename) || textExtensions.has(extension)) {
        await writeFile(
          targetFile,
          applyTextTransforms(bytes.toString('utf8'), definition),
          'utf8',
        );
      } else {
        await writeFile(targetFile, bytes);
      }
    }

    await writeTemplateManifest(resolvedOutput, provenance);
    return success(await buildPublicationArtifact(resolvedOutput));
  } catch (error) {
    return failure([
      {
        code: 'TEMPLATE_BUILD_001',
        severity: 'error',
        location: { file: String(sourceInput) },
        observed: error instanceof Error ? error.message : String(error),
        expected: 'A path-safe deterministic template artifact',
        reason: 'Template materialization failed',
        remediation: 'Correct the source contract or selected files and rerun the dry run',
        documentation: 'docs/maintainers/template-publication.md',
      },
    ]);
  }
}
