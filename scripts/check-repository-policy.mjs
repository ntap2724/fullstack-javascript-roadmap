import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'AGENTS.md',
  'curriculum/AGENTS.md',
  'exercises/AGENTS.md',
  'templates/AGENTS.md',
  'packages/AGENTS.md',
  'tooling/AGENTS.md',
  'apps/docs/AGENTS.md',
];

for (const file of requiredFiles) await access(file);

const root = await readFile('AGENTS.md', 'utf8');
for (const phrase of [
  'implemented',
  'verified',
  'Do not delete, skip, or weaken failing tests',
  'Do not change acceptance criteria after implementation',
]) {
  if (!root.includes(phrase)) throw new Error(`Missing root governance phrase: ${phrase}`);
}
