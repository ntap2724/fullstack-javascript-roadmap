import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Diagnostic } from '@roadmap/validation-core';
import type { ReleasePlan } from './schema.js';

export const REQUIRED_ISSUE_CONTRACT_IDS = [
  'R1-EXERCISE-JS-001',
  'R1-CONTENT-JS-001',
  'R1-WEB-001',
  'R1-API-001',
  'R1-DB-001',
  'R1-SEC-001',
  'R1-DB-002',
  'R1-FULLSTACK-001',
] as const;

const REQUIRED_HEADINGS = [
  'Objective',
  'Context',
  'In scope',
  'Out of scope',
  'Allowed boundaries',
  'Required behavior',
  'Failure behavior',
  'Acceptance criteria',
  'Commands',
  'Evidence',
  'Constraints',
  'Open questions',
] as const;

function issue(observed: unknown, reason: string): Diagnostic {
  return {
    code: 'RELEASE_PLAN_CONTRACT_001',
    severity: 'error',
    location: { file: 'planning/release-1/issue-contracts' },
    observed,
    expected: 'Eight named issue contracts with all required nonempty sections',
    reason,
    remediation: 'Repair the named issue contract and rerun Release 1 validation',
    documentation: 'planning/release-1/dependency-graph.md',
  };
}

function sectionBody(source: string, heading: string): string | undefined {
  const matches = [...source.matchAll(new RegExp(`^## ${heading}$`, 'gm'))];
  const [match] = matches;
  if (matches.length !== 1 || match === undefined) return undefined;
  const after = source.slice(match.index + match[0].length);
  const next = after.search(/^##\s+/m);
  return (next < 0 ? after : after.slice(0, next)).trim();
}

export async function validateIssueContracts(
  root: string,
  plan: ReleasePlan,
): Promise<readonly Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
  const planIds = new Set(plan.items.map((item) => item.id));
  for (const id of REQUIRED_ISSUE_CONTRACT_IDS) {
    if (!planIds.has(id)) {
      diagnostics.push(issue(id, `Required issue contract ${id} is absent from backlog.yaml`));
      continue;
    }
    const filePath = path.join(root, 'planning', 'release-1', 'issue-contracts', `${id}.md`);
    let source: string;
    try {
      await access(filePath);
      source = await readFile(filePath, 'utf8');
    } catch (error) {
      diagnostics.push(issue(id, `Cannot read required issue contract (${String(error)})`));
      continue;
    }
    if (!new RegExp(`^#\\s+${id}\\b`, 'm').test(source)) {
      diagnostics.push(issue(id, 'Issue contract heading does not identify its backlog item'));
    }
    for (const heading of REQUIRED_HEADINGS) {
      const body = sectionBody(source, heading);
      if (body === undefined || body.length === 0) {
        diagnostics.push(
          issue(`${id}:${heading}`, `Required section ${heading} is missing or empty`),
        );
      }
      if (heading === 'Open questions') {
        const item = plan.items.find((candidate) => candidate.id === id);
        if (item?.status === 'ready' && body !== 'None.') {
          diagnostics.push(
            issue(`${id}:${heading}`, 'A ready item must declare Open questions: None.'),
          );
        }
      }
    }
  }
  return diagnostics;
}
