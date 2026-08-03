import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateEvidenceManifestJsonSchema } from '../src/json-schema.js';
import { EvidenceManifestSchema, satisfiesTrustRequirement } from '../src/index.js';

async function readManifestVersionMismatchFixture(): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL('../../../fixtures/evidence/invalid/manifest-version-mismatch.json', import.meta.url),
      'utf8',
    ),
  ) as unknown;
}

const valid = {
  schemaVersion: 1,
  curriculumVersion: '0.1.0',
  templateVersion: '0.1.0',
  milestoneId: 'milestone-fullstack-vertical-slice',
  repository: {
    url: 'https://github.com/example/workshop-enrollment',
    commit: '0123456789abcdef0123456789abcdef01234567',
    attestations: ['repository-verifiable'],
  },
  verification: {
    ciRun: 'https://github.com/example/workshop-enrollment/actions/runs/123',
    status: 'passed',
    attestations: ['ci-verified'],
  },
  artifacts: [
    {
      id: 'evidence-architecture-overview',
      path: 'evidence/architecture/overview.md',
      attestations: ['repository-verifiable'],
    },
  ],
};

describe('EvidenceManifestSchema', () => {
  it('accepts a versioned evidence manifest', () => {
    expect(EvidenceManifestSchema.parse(valid)).toEqual(valid);
  });

  it('rejects the named repository manifest-version-mismatch fixture', async () => {
    const fixture = await readManifestVersionMismatchFixture();

    expect(() => EvidenceManifestSchema.parse(fixture)).toThrow();
  });

  it('rejects mutable branch names as repository commits', () => {
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        repository: { ...valid.repository, commit: 'main' },
      }),
    ).toThrow();
  });

  it('treats evidence attestations as independent capabilities, not a total order', () => {
    expect(satisfiesTrustRequirement(['self-reported'], 'ci-verified')).toBe(false);
    expect(satisfiesTrustRequirement(['human-reviewed'], 'ci-verified')).toBe(false);
    expect(satisfiesTrustRequirement(['externally-observable'], 'repository-verifiable')).toBe(
      false,
    );
    expect(satisfiesTrustRequirement(['ci-verified', 'human-reviewed'], 'ci-verified')).toBe(true);
  });

  it('rejects a failed verification that claims ci-verified attestation', () => {
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        verification: { ...valid.verification, status: 'failed' },
      }),
    ).toThrow(/failed verification cannot claim ci-verified/);
  });

  it('rejects duplicate artifact IDs, traversal paths, insecure URLs, and duplicate attestations', () => {
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        artifacts: [valid.artifacts[0], valid.artifacts[0]],
      }),
    ).toThrow(/Artifact IDs must be unique/);
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        artifacts: [{ ...valid.artifacts[0], path: '../answer.md' }],
      }),
    ).toThrow();
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        repository: { ...valid.repository, url: 'http://example.com/repo' },
      }),
    ).toThrow();
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        repository: {
          ...valid.repository,
          attestations: ['repository-verifiable', 'repository-verifiable'],
        },
      }),
    ).toThrow(/Attestations must be unique/);
  });

  it('rejects unknown manifest and nested object keys', () => {
    expect(() => EvidenceManifestSchema.parse({ ...valid, undocumentedField: true })).toThrow();
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        verification: { ...valid.verification, undocumentedField: true },
      }),
    ).toThrow();
  });

  it('requires canonical milestone and evidence artifact families', () => {
    expect(() =>
      EvidenceManifestSchema.parse({ ...valid, milestoneId: 'evidence-architecture-overview' }),
    ).toThrow();
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        artifacts: [{ ...valid.artifacts[0], id: 'milestone-fullstack-vertical-slice' }],
      }),
    ).toThrow();
  });

  it('requires schema version one and semver curriculum and template versions', () => {
    expect(EvidenceManifestSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
    expect(EvidenceManifestSchema.safeParse({ ...valid, curriculumVersion: '0.1' }).success).toBe(
      false,
    );
    expect(EvidenceManifestSchema.safeParse({ ...valid, templateVersion: 'v0.1.0' }).success).toBe(
      false,
    );
  });

  it('requires nonempty attestations and evidence artifacts', () => {
    expect(
      EvidenceManifestSchema.safeParse({
        ...valid,
        repository: { ...valid.repository, attestations: [] },
      }).success,
    ).toBe(false);
    expect(EvidenceManifestSchema.safeParse({ ...valid, artifacts: [] }).success).toBe(false);
  });
});

describe('generated JSON Schema', () => {
  it('matches the canonical evidence manifest schema exactly', async () => {
    const committed: unknown = JSON.parse(
      await readFile(
        new URL('../generated/evidence-manifest.schema.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;

    expect(committed).toEqual(generateEvidenceManifestJsonSchema());
  });
});
