# ADR 0003: Workshop Enrollment package and trust boundaries

**Status:** Accepted for the Release 1 reference stack

## Decision

The fullstack vertical-slice starter is organized into four packages with strict ownership and import-direction rules:

```text
apps/web
└── Owns UI state, URL state, forms, and API adapters

apps/api
└── Owns HTTP transport, authentication, authorization, and application workflows

packages/contracts
└── Owns public request/response schemas only

packages/database
└── Owns Drizzle schema, migrations, and database adapters; never imported by web
```

### Import direction rules

- `apps/web` may import from `packages/contracts` only
- `apps/api` may import from `packages/contracts` and `packages/database`
- `packages/contracts` imports from no internal package
- `packages/database` imports from no internal package
- No package may import from `apps/web` or `apps/api`

### Explicitly rejected patterns

- Importing Drizzle row types, table definitions, or query builders into React components
- Importing React components, hooks, or UI utilities into the API
- Sharing database entity types directly between frontend and backend instead of using wire-contract schemas
- Placing business logic in `packages/contracts` beyond schema definition and validation

## Consequences

- Wire contracts (`packages/contracts`) are the single shared surface between frontend and backend
- Database schema changes require explicit contract updates in `packages/contracts` before either consumer can adopt them
- Dependency policy tests must enforce these import boundaries at build time
- This boundary structure supports independent testing, deployment, and reasoning about each layer
