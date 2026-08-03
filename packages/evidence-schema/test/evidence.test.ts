import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateEvidenceManifestJsonSchema } from '../src/json-schema.js';
import { EvidenceManifestSchema, satisfiesTrustRequirement } from '../src/index.js';
import type { EvidenceAttestations, EvidenceManifest, EvidenceTrustLevel } from '../src/index.js';

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
} as const;

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

  it('keeps artifacts[].id uniqueness as a runtime invariant beyond stock JSON Schema object equality', () => {
    expect(() =>
      EvidenceManifestSchema.parse({
        ...valid,
        artifacts: [
          valid.artifacts[0],
          {
            ...valid.artifacts[0],
            path: 'evidence/architecture/alternate.md',
          },
        ],
      }),
    ).toThrow(/Artifact IDs must be unique/);
  });

  it('requires canonical repository-relative evidence paths', () => {
    const invalidPaths = [
      'https://example.invalid/evidence.json',
      'mailto:owner@example.invalid',
      '/absolute.md',
      'C:/absolute.md',
      'C:\\absolute.md',
      'evidence\\architecture\\overview.md',
      '.\\evidence.md',
      './evidence.md',
      'evidence/./file.md',
      'evidence/../file.md',
      'evidence//file.md',
      'evidence/',
      '',
    ];

    for (const path of invalidPaths) {
      expect(
        EvidenceManifestSchema.safeParse({
          ...valid,
          artifacts: [{ ...valid.artifacts[0], path }],
        }).success,
      ).toBe(false);
    }

    expect(
      EvidenceManifestSchema.safeParse({
        ...valid,
        artifacts: [{ ...valid.artifacts[0], path: 'evidence/architecture/overview.md' }],
      }).success,
    ).toBe(true);
  });

  it('rejects control characters in runtime and generated evidence paths', () => {
    const generatedPathPattern = (
      generateEvidenceManifestJsonSchema() as {
        properties: {
          artifacts: {
            items: {
              properties: {
                path: {
                  pattern: string;
                };
              };
            };
          };
        };
      }
    ).properties.artifacts.items.properties.path.pattern;
    const generatedPathRegex = new RegExp(generatedPathPattern);
    const invalidPaths = [
      '\nevidence/architecture/overview.md',
      'evidence/architecture/overview.md\n',
      'evidence/architecture/\roverview.md',
      'evidence/architecture/\noverview.md',
      'evidence/architecture/\r\noverview.md',
      'evidence/architecture/\0overview.md',
      'evidence/architecture/\toverview.md',
      'evidence/architecture/\u001foverview.md',
      'evidence/architecture/\u007foverview.md',
      'evidence/architecture/\u0085overview.md',
      'evidence/architecture/\u2028overview.md',
      'evidence/architecture/\u2029overview.md',
    ];

    const runtimeResults = invalidPaths.map(
      (path) =>
        EvidenceManifestSchema.safeParse({
          ...valid,
          artifacts: [{ ...valid.artifacts[0], path }],
        }).success,
    );
    const generatedResults = invalidPaths.map((path) => generatedPathRegex.test(path));

    expect(runtimeResults).toEqual(invalidPaths.map(() => false));
    expect(generatedResults).toEqual(invalidPaths.map(() => false));
    expect(
      EvidenceManifestSchema.safeParse({
        ...valid,
        artifacts: [{ ...valid.artifacts[0], path: 'evidence/architecture/overview.md' }],
      }).success,
    ).toBe(true);
    expect(generatedPathRegex.test('evidence/architecture/overview.md')).toBe(true);
  });

  it('rejects insecure URLs and duplicate attestations', () => {
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

  it('accepts omitted and valid deployment records but rejects unknown deployment fields', () => {
    expect(EvidenceManifestSchema.parse(valid).deployment).toBeUndefined();

    const deployment = {
      frontend: 'https://example.invalid/deployment',
      attestations: ['externally-observable'],
    };

    expect(EvidenceManifestSchema.parse({ ...valid, deployment }).deployment).toEqual(deployment);
    expect(
      EvidenceManifestSchema.safeParse({
        ...valid,
        deployment: { ...deployment, undocumentedField: true },
      }).success,
    ).toBe(false);
  });

  it('supports external consumers of EvidenceManifest and trust public types', () => {
    const requiredTrust: EvidenceTrustLevel = 'ci-verified';
    const attestations: EvidenceAttestations = [requiredTrust];
    const manifest: EvidenceManifest = EvidenceManifestSchema.parse(valid);

    expect(satisfiesTrustRequirement(attestations, requiredTrust)).toBe(true);
    expect(manifest.artifacts).toHaveLength(1);
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

    expect(committed).toMatchObject({
      properties: {
        repository: { properties: { attestations: { uniqueItems: true } } },
        deployment: { properties: { attestations: { uniqueItems: true } } },
        verification: {
          properties: { attestations: { uniqueItems: true } },
          not: {
            properties: {
              status: { const: 'failed' },
              attestations: { contains: { const: 'ci-verified' } },
            },
            required: ['status', 'attestations'],
          },
        },
        artifacts: {
          items: { properties: { attestations: { uniqueItems: true } } },
        },
      },
    });
    expect(committed).toEqual(generateEvidenceManifestJsonSchema());
  });
});
