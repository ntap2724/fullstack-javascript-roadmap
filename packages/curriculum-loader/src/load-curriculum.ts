import { readdir } from 'node:fs/promises';
import path from 'node:path';
import type { CurriculumCorpus } from '@roadmap/curriculum-schema';
import {
  failure,
  hasErrors,
  mergeDiagnostics,
  success,
  type ValidationOutcome,
} from '@roadmap/validation-core';
import { loadCurriculumFile } from './load-file.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx']);

function toSortKey(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export async function loadCurriculum(root: string): Promise<ValidationOutcome<CurriculumCorpus>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const filePaths = entries
    .filter(
      (entry) =>
        entry.name !== 'AGENTS.md' &&
        entry.isFile() &&
        MARKDOWN_EXTENSIONS.has(path.extname(entry.name)),
    )
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort((a, b) => {
      const keyA = toSortKey(a);
      const keyB = toSortKey(b);
      return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
    });

  const documents = [];
  let diagnostics = mergeDiagnostics([]);

  for (const filePath of filePaths) {
    const outcome = await loadCurriculumFile(filePath);
    diagnostics = mergeDiagnostics(diagnostics, outcome.diagnostics);
    if (outcome.ok) {
      documents.push(outcome.value);
    }
  }

  if (hasErrors(diagnostics)) {
    return failure(diagnostics);
  }

  return success({ documents }, diagnostics);
}
