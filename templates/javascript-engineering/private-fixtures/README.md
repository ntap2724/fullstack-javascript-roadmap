# Private fixtures

This directory holds maintainer-only material for the JavaScript engineering starter, such as
reference solutions and grading fixtures.

**Nothing in this directory may ever reach the published starter repository.**

Containment is enforced by allowlist, not by this note. The template contract in
`../template.yaml` selects only `files/**`, so this directory is never selected in the first
place. The `files/**/private-fixtures/**` exclusion pattern is defense in depth for the case
where a future author adds a nested `private-fixtures/` directory underneath `files/`.

If you add material here, do not also add a copy underneath `files/`.
