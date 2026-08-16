# ADR 0004: Reference deployment shape

**Status:** Accepted for the Release 1 reference stack

## Decision

The reference production deployment uses three separate artifacts:

```text
Static web artifact
└── Built React SPA served from a static hosting origin

Container- or process-based API artifact
└── Express application deployed independently from the web origin

Managed PostgreSQL database
└── Provider-managed relational database accessed only by the API
```

Vendor selection is deferred. The deployment shape constrains the architecture regardless of provider.

## Required properties

- HTTPS for all browser-accessible production endpoints
- API and web origins configured explicitly (not inferred)
- Server-side secrets unavailable to the static web build
- Migration step is separate from API process startup
- Health endpoint does not disclose secrets or dependency credentials
- Rollback reasoning appears in Release 1 planning, but automated rollback is not a Release 0 deliverable

## Local development mapping

```text
Web:     localhost:5173
API:     localhost:3000
PostgreSQL: localhost:5432
```

Local development uses credentialed cross-origin requests between same-site origins to match the reference production topology.

## Rejected alternatives

- Single monolithic deploy combining web and API, because it conflates static and dynamic scaling concerns and hides the cross-origin security boundary being taught
- Serverless functions as the primary API target, because cold-start behavior and platform-specific bindings would distract from the portable session and transaction patterns being taught
- Embedded SQLite, because it cannot represent the concurrent enrollment capacity constraints that motivate the transaction curriculum

## Consequences

- CORS configuration is a required curriculum topic, not an optional optimization
- Environment variable management differs between the static build and the runtime API
- Learners must reason about two deployable artifacts and one managed service
- CI verification must work without any running production service (baseline gate), while learner verification targets the real workflow seams
