export const evidenceTrustLevels = [
  'self-reported',
  'repository-verifiable',
  'ci-verified',
  'externally-observable',
  'human-reviewed',
] as const;

export type EvidenceTrustLevel = (typeof evidenceTrustLevels)[number];
export type EvidenceAttestations = readonly EvidenceTrustLevel[];

export function satisfiesTrustRequirement(
  actual: EvidenceAttestations,
  required: EvidenceTrustLevel,
): boolean {
  return actual.includes(required);
}
