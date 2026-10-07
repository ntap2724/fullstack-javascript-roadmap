---
schemaVersion: 1
kind: release
id: release-missing-exit-gate
slug: releases/missing-exit-gate
title: Release with missing exit gate
description: A release whose exitGate does not resolve to a known document
status: review
prerequisites: []
version: 0.1.0
maturity: experimental
track: track-fixture-target
entryGate: gate-fixture-entry
exitGate: gate-nonexistent-exit
claims:
  - Test fixture for unresolved reference validation
nonClaims:
  - This is not a real release
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

Fixture for testing that CURRICULUM_REFERENCE_001 fires when a release exitGate does not resolve.
