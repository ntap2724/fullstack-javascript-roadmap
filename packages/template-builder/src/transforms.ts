import type { TemplateDefinition } from '@roadmap/template-contract';

const UNRESOLVED_TOKEN_PATTERN = /\{\{[A-Z0-9_]+\}\}/g;

export function applyTextTransforms(input: string, definition: TemplateDefinition): string {
  let output = input;
  for (const transform of definition.publication.textTransforms) {
    const value =
      transform.valueFrom === 'template.version'
        ? definition.version
        : definition.curriculum.release;
    output = output.replaceAll(transform.token, value);
  }
  const unresolved = output.match(UNRESOLVED_TOKEN_PATTERN);
  if (unresolved !== null) {
    throw new Error(`TEMPLATE_TRANSFORM_001:${[...new Set(unresolved)].join(',')}`);
  }
  return output;
}
