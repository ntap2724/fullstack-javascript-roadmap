---
schemaVersion: 1
kind: project
id: project-workshop-enrollment
slug: projects/workshop-enrollment
title: Workshop Enrollment
description: Reference vertical-slice milestone for the Release 1 technical preview
status: review
prerequisites:
  - gate-express-postgresql
competencies:
  - react.state.ownership
  - api.validation.runtime-boundary
  - api.authentication.session-lifecycle
  - api.authorization.resource-ownership
  - db.model.relational-constraints
  - db.transaction.atomic-enrollment
  - fullstack.contract.error-mapping
  - fullstack.incident.duplicate-submission
contractPath: projects/milestones/workshop-enrollment/project.yaml
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

Workshop Enrollment is the reference vertical-slice milestone for Release 1. It requires learners to build a full-stack application that manages workshop enrollment with authentication, authorization, capacity constraints, and transactional integrity. The complete machine-readable contract lives in `projects/milestones/workshop-enrollment/`.
