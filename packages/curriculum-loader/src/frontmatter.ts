import YAML from 'yaml';

export interface ParsedFrontmatter {
  data: unknown;
  body: string;
}

export function parseFrontmatter(source: string): ParsedFrontmatter {
  if (!source.startsWith('---\n')) throw new Error('Missing opening frontmatter delimiter');
  const end = source.indexOf('\n---\n', 4);
  if (end < 0) throw new Error('Missing closing frontmatter delimiter');
  const data: unknown = YAML.parse(source.slice(4, end));
  const body = source.slice(end + 5);
  return { data, body };
}
