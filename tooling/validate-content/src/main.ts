import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCurriculumGraph, validateCurriculumGraph } from '@roadmap/curriculum-graph';
import { loadCurriculum } from '@roadmap/curriculum-loader';
import { failure, internalErrorDiagnostic, type ValidationOutcome } from '@roadmap/validation-core';

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

export interface ContentValidatorDependencies {
  load: typeof loadCurriculum;
  buildGraph: typeof buildCurriculumGraph;
  validateGraph: typeof validateCurriculumGraph;
}

const defaultDependencies: ContentValidatorDependencies = {
  load: loadCurriculum,
  buildGraph: buildCurriculumGraph,
  validateGraph: validateCurriculumGraph,
};

export async function validateContent(
  root: string,
  dependencies: ContentValidatorDependencies = defaultDependencies,
): Promise<ValidationOutcome<unknown>> {
  try {
    const corpus = await dependencies.load(root);
    if (!corpus.ok) return corpus;
    const graph = dependencies.buildGraph(corpus.value);
    if (!graph.ok) return graph;
    return dependencies.validateGraph(graph.value);
  } catch (error) {
    return failure([internalErrorDiagnostic(error, root)]);
  }
}

export function parseArguments(args: readonly string[]): {
  root: string;
  format: 'text' | 'json';
} {
  let root = 'curriculum';
  let format: 'text' | 'json' = 'text';
  let rootSeen = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (index === 0 && argument === '--') continue;
    if (argument === '--format') {
      const value = args[index + 1];
      if (value !== 'text' && value !== 'json') {
        throw new Error('--format must be text or json');
      }
      format = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) throw new Error(`Unknown option: ${argument}`);
    if (rootSeen) throw new Error(`Unexpected positional argument: ${argument}`);
    root = argument;
    rootSeen = true;
  }

  return { root: path.resolve(repositoryRoot, root), format };
}

async function main(): Promise<void> {
  let parsed: { root: string; format: 'text' | 'json' };
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    const outcome = failure([internalErrorDiagnostic(error, '<arguments>')]);
    console.log(JSON.stringify(outcome.diagnostics, null, 2));
    process.exitCode = 1;
    return;
  }

  const outcome = await validateContent(parsed.root);
  if (parsed.format === 'json') {
    console.log(JSON.stringify(outcome.diagnostics, null, 2));
  } else {
    for (const diagnostic of outcome.diagnostics) {
      console.error(`${diagnostic.code} ${diagnostic.location.file}: ${diagnostic.reason}`);
      console.error(`  Expected: ${diagnostic.expected}`);
      console.error(`  Remediation: ${diagnostic.remediation}`);
    }
  }

  if (!outcome.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
