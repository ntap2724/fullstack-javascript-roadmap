import { z } from 'zod';
import { ArtifactIdSchema } from '@roadmap/curriculum-schema';
import { evidenceTrustLevels } from './trust.js';

const TrustSchema = z.enum(evidenceTrustLevels);

const AttestationsSchema = z
  .array(TrustSchema)
  .min(1)
  .superRefine((attestations, context) => {
    if (new Set(attestations).size !== attestations.length) {
      context.addIssue({ code: 'custom', message: 'Attestations must be unique' });
    }
  });

const SemverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

const UrlSchema = z.url().and(z.string().regex(/^https:\/\//, 'Evidence URLs must use HTTPS'));

const EvidencePathControlCharacterClass =
  '[\\u' + '0000-\\u' + '001f\\u007f-\\u009f\\u2028\\u2029]';

const RelativeEvidencePathPattern = new RegExp(
  '^(?![\\s\\S]*' +
    EvidencePathControlCharacterClass +
    ')(?!\\.{1,2}(?:\\/|$))(?!.*\\/\\.{1,2}(?:\\/|$))' +
    '(?!(?:[^/]*\\/)*(?:[cC][oO][nN]|[pP][rR][nN]|[aA][uU][xX]|[nN][uU][lL]|[cC][oO][mM][1-9]|[lL][pP][tT][1-9])(?:\\.[^/]*)?(?:\\/|$))' +
    '(?!(?:[^/]*\\/)*[^/]*[. ](?:\\/|$))' +
    '[^/:\\\\]+(?:\\/[^/:\\\\]+)*$',
);

const RelativeEvidencePathSchema = z
  .string()
  .regex(
    RelativeEvidencePathPattern,
    'Evidence paths must be repository-relative and cannot traverse',
  );

const MilestoneIdSchema = ArtifactIdSchema.regex(
  /^milestone-/,
  'Milestone IDs must use the canonical milestone artifact family',
);

const EvidenceArtifactIdSchema = ArtifactIdSchema.regex(
  /^evidence-/,
  'Evidence artifact IDs must use the canonical evidence artifact family',
);

export const EvidenceManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    curriculumVersion: SemverSchema,
    templateVersion: SemverSchema,
    milestoneId: MilestoneIdSchema,
    repository: z
      .object({
        url: UrlSchema,
        commit: z.string().regex(/^[0-9a-f]{40}$/),
        attestations: AttestationsSchema,
      })
      .strict(),
    deployment: z
      .object({
        frontend: UrlSchema.optional(),
        api: UrlSchema.optional(),
        attestations: AttestationsSchema,
      })
      .strict()
      .optional(),
    verification: z
      .object({
        ciRun: UrlSchema,
        status: z.enum(['passed', 'failed']),
        attestations: AttestationsSchema,
      })
      .strict(),
    artifacts: z
      .array(
        z
          .object({
            id: EvidenceArtifactIdSchema,
            path: RelativeEvidencePathSchema,
            attestations: AttestationsSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const artifactIds = manifest.artifacts.map((artifact) => artifact.id);

    if (new Set(artifactIds).size !== artifactIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['artifacts'],
        message: 'Artifact IDs must be unique',
      });
    }

    if (
      manifest.verification.status === 'failed' &&
      manifest.verification.attestations.includes('ci-verified')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['verification', 'attestations'],
        message: 'A failed verification cannot claim ci-verified attestation',
      });
    }

    if (
      manifest.deployment !== undefined &&
      manifest.deployment.frontend === undefined &&
      manifest.deployment.api === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['deployment'],
        message: 'A deployment record must name a frontend or an api endpoint',
      });
    }
  });

export type EvidenceManifest = z.infer<typeof EvidenceManifestSchema>;
