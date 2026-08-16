# Release Verification Evidence

## What the evidence package proves

The release verification evidence package proves which allowlisted files were
copied and hashed for one source commit and one workflow run. Each record
contains the file path, byte count, and SHA-256 hash.

## What the evidence package does NOT prove

- Learner authorship or educational effectiveness
- Absence of every vulnerability
- Correctness beyond the commands represented by the reports
- That the website is deployed or accessible
- That any specific user will have a particular experience

## Evidence records

| Record                          | Description                                          |
| ------------------------------- | ---------------------------------------------------- |
| `platform/ubuntu-24.04.json`    | Linux release verification status                    |
| `platform/windows-2025.json`    | Windows release verification status                  |
| `browser/all.json`              | Multi-browser (Chromium, Firefox, WebKit) E2E status |
| `negative-fixtures/report.json` | Expected-failure manifest verification               |
| `templates/*/report.json`       | Template publication verification                    |
| `spikes/*.json`                 | Architecture spike derivation records                |

## Integrity

Every record in the manifest is verified by `verify-release-0.mjs`, which
checks:

1. All required records are present
2. Every record names the same source commit as the manifest
3. Every record has status `passed`
4. Every file matches its recorded byte count and SHA-256 hash
5. No duplicate or unrecognized spike records exist
