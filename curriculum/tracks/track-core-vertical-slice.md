---
schemaVersion: 1
kind: track
id: track-core-vertical-slice
slug: tracks/core-vertical-slice
title: Core vertical slice
description: Technical preview route proving the Release 1 architecture through the Workshop Enrollment domain
status: review
prerequisites: []
requiredCompetencies:
  - engineering.repository.reproducible-setup
  - engineering.git.pull-request
  - js.value.object-identity
  - js.function.closure
  - js.async.promise-error
  - browser.dom.event-flow
  - browser.fetch.http-boundary
  - ts.narrowing.untrusted-input
  - react.state.ownership
  - react.server-state.lifecycle
  - http.request-response-semantics
  - api.validation.runtime-boundary
  - api.authentication.session-lifecycle
  - api.authorization.resource-ownership
  - db.model.relational-constraints
  - db.transaction.atomic-enrollment
  - fullstack.contract.error-mapping
  - fullstack.incident.duplicate-submission
  - career.evidence.technical-walkthrough
modules:
  - module-engineering-baseline
  - module-javascript-essentials
  - module-browser-interaction
  - module-typescript-bridge
  - module-react-spa
  - module-http-express
  - module-postgresql-drizzle
  - module-fullstack-integration
  - module-mini-capstone
gates:
  - gate-engineering-baseline
  - gate-js-browser-essentials
  - gate-typescript-bridge
  - gate-react-spa
  - gate-express-postgresql
  - gate-fullstack-integration
  - gate-mini-capstone
introducedIn: 0.1.0
lastReviewedIn: 0.1.0
---

This is a technical-preview route and not a completed Junior Fullstack curriculum. It proves that the intended learning path, contracts, and starter can be validated together through the Workshop Enrollment vertical slice.
