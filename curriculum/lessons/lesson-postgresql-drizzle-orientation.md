---
schemaVersion: 1
kind: lesson
id: lesson-postgresql-drizzle-orientation
slug: lessons/postgresql-drizzle-orientation
title: PostgreSQL and Drizzle orientation
description: Orientation for relational constraints and atomic transactions
status: review
prerequisites: []
module: module-postgresql-drizzle
competencies:
  - db.model.relational-constraints
  - db.transaction.atomic-enrollment
exercises: []
assessments:
  - assessment-express-postgresql
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
sourceLanguage: vi
professionalArtifactLanguage: en
---

## Problem

This module covers competencies required for the Workshop Enrollment vertical slice. The technical preview provides orientation only; full implementation arrives in Release 1.

## Mental model

Each competency in this module represents a bounded skill that must be demonstrated through observable evidence. The gate assessment validates that the learner can apply the competency in the context of the Workshop Enrollment project.

## Minimal reference example

The minimal reference example demonstrates the core pattern for this competency area. It compiles and passes schema validation but does not implement the full Workshop Enrollment workflow.

## Counterexample

A common mistake is to skip runtime validation or rely on frontend checks as the only control. This lesson's counterexample shows why that approach fails under concurrent access.

## Checkpoint

Before proceeding to the next gate, verify that you can explain the competency's role in the Workshop Enrollment workflow and identify at least one real-world failure mode it prevents.

## Current technical-preview boundary

This orientation lesson provides structure and direction only. The full lesson content, exercises, and assessments arrive in Release 1 backlog items. The first Release 1 item that replaces this orientation-only coverage is identified in the Release 1 backlog.

## Next dependency

The next gate in the sequence requires completing this module's assessment. Review the gate's critical criteria before attempting the exit assessment.
