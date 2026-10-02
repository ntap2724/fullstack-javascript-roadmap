---
schemaVersion: 1
kind: gate
id: gate-release-zero-baseline
slug: gates/release-zero-baseline
title: Release 0 baseline
description: Fixture pipeline gate for the Release 0 kernel verification
status: published
prerequisites: []
competencies:
  - js.function.values
  - js.function.closure
entryEvidence:
  - pnpm verify passes on a fresh clone
exitAssessment: assessment-js-closure
criticalCriteria:
  - Repository boots and validates without error
remediation:
  - assessment-js-closure
maturity: experimental
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

Fixture pipeline Release 0: chỉ kiểm chứng cấu trúc gate, chưa phải curriculum hoàn chỉnh.
