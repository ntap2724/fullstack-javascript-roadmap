# ADR 0002: Reference authentication uses server-managed sessions

**Status:** Accepted for the Release 1 reference stack

## Decision

The reference API issues a cryptographically random opaque session identifier after successful login. The browser stores it only in a host-only `HttpOnly` cookie. Production cookies use `Secure`, `SameSite=Lax`, and `Path=/`; the API stores only a one-way hash of the identifier with user, creation, expiry, and revocation data in PostgreSQL.

State-changing requests require a synchronizer CSRF token bound to the session and an allowed `Origin`. The React application sends requests with credentials enabled. The backend remains the only authorization enforcement point.

## Rejected alternatives

- Long-lived bearer tokens in `localStorage`, because script access unnecessarily enlarges the XSS credential boundary
- JWT as the first authentication mechanism, because self-contained token invalidation and renewal would distract from the server-session lifecycle being taught
- Frontend-only route protection, because it cannot enforce server resource access

## Consequences

- Local and reference production deployments must support credentialed cross-origin requests between same-site origins
- Session expiry, logout, rotation, CSRF, CORS, and negative authorization tests become required curriculum topics
- This ADR does not prohibit a later token-authentication specialization
