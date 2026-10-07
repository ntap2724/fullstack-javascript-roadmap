# Release 0 Evidence Index

## Evidence records

| Evidence                              | Producer                  | OS              | Review level |
| ------------------------------------- | ------------------------- | --------------- | ------------ |
| `platform/ubuntu-24.04.json`          | `platform (ubuntu-24.04)` | Linux           | R3           |
| `platform/windows-2025.json`          | `platform (windows-2025)` | Windows         | R3           |
| `browser/all.json`                    | `browser`                 | Linux           | R2           |
| `spikes/curriculum-to-starlight.json` | aggregate derivation      | Linux           | R3           |
| `spikes/curriculum-graph.json`        | aggregate derivation      | Linux           | R3           |
| `spikes/template-publication.json`    | aggregate derivation      | Linux           | R4           |
| `spikes/cross-platform.json`          | aggregate derivation      | Linux + Windows | R3           |
| `spikes/leak-prevention.json`         | aggregate derivation      | Linux           | R4           |
| `wp10/vertical-slice-skeleton.json`   | `pnpm verify:wp10`        | Linux           | R3           |
| `wp10/release-1-backlog.json`         | `pnpm verify:wp10`        | Linux           | R3           |
| `wp10/fullstack-template.json`        | `pnpm verify:wp10`        | Linux           | R4           |

## Negative fixtures

| Record                                | Negative fixture                                | Source command          | Known limitation                                          |
| ------------------------------------- | ----------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| `platform/ubuntu-24.04.json`          | All curriculum and publication invalid fixtures | `pnpm verify:release`   | Does not prove absence of every defect                    |
| `platform/windows-2025.json`          | Same as Ubuntu                                  | `pnpm verify:release`   | Windows-specific path edge cases not exhaustively covered |
| `browser/all.json`                    | None (positive E2E only)                        | `pnpm docs:test:e2e`    | Only covers Chromium, Firefox, WebKit on Linux            |
| `spikes/curriculum-to-starlight.json` | Curriculum schema errors                        | `pnpm content:validate` | Does not verify visual rendering correctness              |
| `spikes/curriculum-graph.json`        | Curriculum graph cycles and references          | `pnpm content:validate` | Only validates declared graph structure                   |
| `spikes/template-publication.json`    | Publication scanner findings                    | `pnpm verify:templates` | Allowlist-based; does not detect novel secret patterns    |
| `spikes/cross-platform.json`          | Same root commands on both OS                   | `pnpm verify:release`   | Does not prove identical binary behavior                  |
| `spikes/leak-prevention.json`         | Publication scanner + template dry-run          | `pnpm verify:templates` | Only scans generated starter output                       |

## Integrity gate

`verify-release-0.mjs` enforces:

1. **RELEASE_EVIDENCE_001** — All required records present
2. **RELEASE_EVIDENCE_002** — Every record names the same source commit as the manifest
3. **RELEASE_EVIDENCE_003** — Every record has status `passed`
4. **RELEASE_EVIDENCE_004** — Every file matches its recorded byte count and SHA-256

## Limitations

This evidence package proves which allowlisted files were copied and hashed for
one source commit and workflow run. It does not prove:

- Learner authorship or educational effectiveness
- Absence of every vulnerability
- Correctness beyond the commands represented by the reports
- That the website is deployed or accessible
