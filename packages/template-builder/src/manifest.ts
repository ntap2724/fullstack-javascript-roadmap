import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TemplateProvenanceSchema, type TemplateProvenance } from '@roadmap/template-contract';

/**
 * Location of the provenance manifest inside a generated artifact. Declared once so that
 * the writer and the functional-hash exclusion cannot drift apart.
 */
export const TEMPLATE_MANIFEST_RELATIVE_PATH = '.roadmap/template-manifest.json';

/** Deterministic manifest bytes: stable key order, two-space indent, single trailing newline. */
export function serializeTemplateManifest(provenance: TemplateProvenance): string {
  return `${JSON.stringify(TemplateProvenanceSchema.parse(provenance), null, 2)}\n`;
}

export async function writeTemplateManifest(
  outputRoot: string,
  provenance: TemplateProvenance,
): Promise<string> {
  const manifestPath = path.join(outputRoot, ...TEMPLATE_MANIFEST_RELATIVE_PATH.split('/'));
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, serializeTemplateManifest(provenance), 'utf8');
  return manifestPath;
}
