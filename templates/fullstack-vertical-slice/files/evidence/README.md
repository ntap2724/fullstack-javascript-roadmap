# Evidence

Store the evidence for this milestone in this directory.

Evidence is how you show that the milestone was actually completed and verified. Keep it honest:
record what you ran and what really happened, including the failures you fixed along the way.

## Submitted evidence versus the example

| File                    | Role                                      | Scanned as submitted evidence? |
| ----------------------- | ----------------------------------------- | ------------------------------ |
| `manifest.json`         | your real evidence manifest               | **yes**                        |
| `manifest.example.json` | a shape reference with placeholder values | **no**                         |

Any file named `*.example.json` is a template, never a submission. Evidence discovery deliberately
ignores that suffix, so the shipped example can never be counted as a completed milestone.

To start your own manifest:

```bash
cp evidence/manifest.example.json evidence/manifest.json
```

Then replace **every** placeholder. The example ships with values that are intentionally impossible
to mistake for real evidence:

- repository URL `https://github.com/replace-me/workshop-enrollment`
- commit `0000000000000000000000000000000000000000`
- attestation reference `replace-me`
- `verification.status` of `failed`, attested only as `self-reported`

A manifest that still contains any `replace-me` value, or the all-zero commit, is not evidence.

## What belongs here

- A short note describing what you built and how you verified it
- The exact commands you ran and their real exit results
- The commit your evidence describes, as a full 40-character hexadecimal SHA
- A link to the CI run for that exact commit
- Deployed web and API URLs, once you reach the deployment module

## What does not belong here

- Screenshots or transcripts of runs that did not happen
- Claims that a command passed when it was not run
- Secrets of any kind: tokens, passwords, session keys, or connection strings
- A copy of the example manifest with its placeholders left in place

## Honest language

`implemented` means you wrote the code. `verified` means you ran the declared checks, read their
real output, and they passed. Do not conflate them.

A `ci-verified` attestation means a CI run for that exact commit passed. If the run failed, or if
there is no run for that commit, the correct attestation is `self-reported` and the correct status
is `failed`.
