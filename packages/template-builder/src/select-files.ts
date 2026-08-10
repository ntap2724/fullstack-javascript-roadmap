import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import picomatch from 'picomatch';
import { isSafeRelativePath } from '@roadmap/exercise-contract';
import { TemplateDefinitionSchema, type TemplateDefinition } from '@roadmap/template-contract';
import { parse } from 'yaml';
import { listSourceFiles } from './list-source-files.js';

export interface TemplateSource {
  root: string;
  definition: TemplateDefinition;
}

export async function loadTemplateDefinition(rootInput: string | URL): Promise<TemplateSource> {
  const root = await realpath(rootInput);
  const definition = TemplateDefinitionSchema.parse(
    parse(await readFile(path.join(root, 'template.yaml'), 'utf8')),
  );
  return { root, definition };
}

export async function selectPublicationFiles(
  rootInput: string | URL,
  suppliedDefinition?: TemplateDefinition,
): Promise<readonly string[]> {
  const { root, definition: loadedDefinition } = await loadTemplateDefinition(rootInput);
  const definition = suppliedDefinition ?? loadedDefinition;
  const includes = definition.publication.include.map((pattern) =>
    picomatch(pattern, { dot: true }),
  );
  const excludes = definition.publication.exclude.map((pattern) =>
    picomatch(pattern, { dot: true }),
  );
  return (await listSourceFiles(root))
    .map((entry) => entry.relativePath)
    .filter((relativePath) => isSafeRelativePath(relativePath))
    .filter((relativePath) => includes.some((matches) => matches(relativePath)))
    .filter((relativePath) => !excludes.some((matches) => matches(relativePath)))
    .sort();
}
