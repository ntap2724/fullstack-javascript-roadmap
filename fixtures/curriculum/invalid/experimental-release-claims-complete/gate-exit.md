---
schemaVersion: 1
kind: gate
id: gate-fixture-claims-exit
slug: gates/fixture-claims-exit
title: Fixture claims exit gate
description: Exit gate for the experimental-release-claims-complete fixture
status: review
prerequisites:
  - gate-fixture-claims-entry
competencies:
  - fixture.competency.claims
entryEvidence:
  - Fixture evidence
exitAssessment: assessment-fixture-claims
criticalCriteria:
  - Fixture criterion
remediation:
  - assessment-fixture-claims
maturity: experimental
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

Fixture gate.
