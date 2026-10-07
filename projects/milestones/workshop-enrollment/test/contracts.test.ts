import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { RubricSchema } from '@roadmap/rubric-schema';
import { RemediationCatalogSchema, validateRemediationCoverage } from '@roadmap/assessment-core';

interface AcceptanceCriterion {
  id: string;
  verificationLayer: string;
  competency: string;
  evidence: string;
  critical: boolean;
  description: string;
}

interface AcceptanceContract {
  schemaVersion: number;
  id: string;
  version: string;
  status: string;
  criteria: AcceptanceCriterion[];
}

describe('Workshop Enrollment contracts', () => {
  it('rubric passes schema validation', async () => {
    const rubric = RubricSchema.parse(
      YAML.parse(await readFile(new URL('../rubric/rubric.yaml', import.meta.url), 'utf8')),
    );
    expect(rubric.id).toBe('rubric-workshop-enrollment');
  });

  it('remediation catalog passes schema validation', async () => {
    const remediation = RemediationCatalogSchema.parse(
      YAML.parse(await readFile(new URL('../remediation/catalog.yaml', import.meta.url), 'utf8')),
    );
    expect(remediation.entries.length).toBeGreaterThan(0);
  });

  it('covers every required or critical rubric criterion with remediation', async () => {
    const rubric = RubricSchema.parse(
      YAML.parse(await readFile(new URL('../rubric/rubric.yaml', import.meta.url), 'utf8')),
    );
    const remediation = RemediationCatalogSchema.parse(
      YAML.parse(await readFile(new URL('../remediation/catalog.yaml', import.meta.url), 'utf8')),
    );
    const outcome = validateRemediationCoverage(rubric, remediation);
    expect(outcome.ok).toBe(true);
  });

  it('acceptance contract references declared competencies', async () => {
    const contract = YAML.parse(
      await readFile(new URL('../acceptance/contract.yaml', import.meta.url), 'utf8'),
    ) as AcceptanceContract;
    const knownCompetencies = [
      'react.state.ownership',
      'api.validation.runtime-boundary',
      'api.authentication.session-lifecycle',
      'api.authorization.resource-ownership',
      'db.model.relational-constraints',
      'db.transaction.atomic-enrollment',
      'fullstack.contract.error-mapping',
      'fullstack.incident.duplicate-submission',
      'react.server-state.lifecycle',
      'career.evidence.technical-walkthrough',
    ];
    for (const criterion of contract.criteria) {
      expect(knownCompetencies).toContain(criterion.competency);
    }
  });

  it('acceptance contract covers all required criteria', async () => {
    const contract = YAML.parse(
      await readFile(new URL('../acceptance/contract.yaml', import.meta.url), 'utf8'),
    ) as AcceptanceContract;
    const requiredIds = [
      'web.public-workshop-list',
      'web.authentication-states',
      'web.loading-empty-error',
      'api.invalid-payload-400',
      'api.unauthenticated-401',
      'api.forbidden-resource-403',
      'api.enroll-success-201',
      'api.duplicate-enrollment-409',
      'db.unique-user-workshop',
      'db.capacity-transaction',
      'fullstack.repeated-submit-idempotent-outcome',
      'evidence.commit-pinned',
    ];
    const actualIds = contract.criteria.map((c) => c.id);
    for (const id of requiredIds) {
      expect(actualIds).toContain(id);
    }
  });
});
