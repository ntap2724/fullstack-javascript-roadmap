---
schemaVersion: 1
kind: gate
id: gate-fixture-orphan-competency
slug: gates/orphan-competency
title: Fixture gate
description: Minimal gate for fixture validation
status: review
prerequisites: []
competencies:
  - test.reachable
entryEvidence:
  - Fixture evidence
exitAssessment: assessment-orphan-evidence
criticalCriteria:
  - Fixture criterion
remediation:
  - assessment-orphan-evidence
maturity: experimental
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

Fixture gate.
