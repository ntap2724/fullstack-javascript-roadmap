# Lộ trình Fullstack JavaScript — Design specification

**Status:** Approved
**Date:** 2026-07-26
**Repository working name:** `fullstack-javascript-roadmap`
**Product name:** Lộ trình Fullstack JavaScript
**Primary language:** Vietnamese explanations, English professional artifacts
**Scope:** Greenfield repository; no architecture, content, code, identifiers, or constraints are inherited from any previous repository

---

## 0. Executive decision summary

The repository is a self-study, competency-based program for learners who already know basic programming in C++, Python, Java, or a comparable language but have not yet learned web development.

Its core outcome is not merely “finish the lessons” or “build a CRUD demo.” A learner completing the core curriculum must have enough verifiable technical evidence to begin applying for Junior Fullstack JavaScript roles in Vietnam and entry-level or junior remote roles internationally.

The approved product model is:

```text
Repository as the source of truth
        ↓
Generated documentation website
        ↓
Versioned starter repositories
        ↓
Learner-owned project repositories
        ↓
Automated verification + rubric + evidence package
```

The approved core stack is:

```text
JavaScript runtime foundations
        ↓
TypeScript bridge
        ↓
React + Vite SPA
        ↓
Node.js primitives laboratory
        ↓
Express + TypeScript modular monolith
        ↓
PostgreSQL and raw SQL foundations
        ↓
node-postgres laboratory
        ↓
Drizzle application data layer
        ↓
Fullstack deployment and capstone
```

The approved specializations are separate from core:

```text
Next.js
NestJS
Prisma
Redis and caching
Queues and background jobs
Realtime and WebSocket
Object storage
Observability
Design systems
Advanced accessibility
Frontend performance
Internationalization
Offline-first applications
```

The development strategy is:

```text
Release 0: Contract and repository kernel
Release 1: End-to-end vertical slice
Release 2: Engineering, web, and JavaScript foundations
Release 3: TypeScript and production-aware React
Release 4: PostgreSQL and production-aware Express backend
Release 5: Fullstack integration, capstone, and career readiness
Release 6+: Specializations
```

The repository is not a learning-management system. It does not initially provide accounts, cloud progress storage, an online IDE, remote code execution, leaderboards, automatic certificates, or an integrated AI tutor.

---

# 1. Product charter

## 1.1 Product definition

The product is an open, repository-first curriculum that gives a learner an executable path through the complete learning loop:

```text
Learn
→ Practise
→ Build
→ Verify
→ Diagnose
→ Adapt
→ Explain
→ Produce evidence
→ Advance
```

A simple topic checklist is insufficient. Every important competency must connect to:

- A precise definition
- Explicit prerequisites
- Learning material
- Focused practice
- An assessment contract
- Remediation when the learner does not meet the contract
- Evidence that can be retained in the learner’s own repository

## 1.2 Primary learner

The primary learner already understands basic programming concepts such as:

- Variables and values
- Conditions and loops
- Functions
- Basic data structures
- Basic debugging
- Reading small programs

The curriculum does not assume prior knowledge of:

- HTML or CSS
- JavaScript semantics
- Browser behavior
- DOM and browser events
- HTTP
- Frontend frameworks
- Backend development
- SQL or relational databases
- Authentication or authorization
- Web testing and deployment

## 1.3 Primary outcome

A learner completing the core curriculum should be ready to begin applying for:

```text
Junior Fullstack JavaScript Developer
```

The curriculum supports two career contexts:

- Vietnam as the baseline job market
- Remote international work as an additional professional-communication track

The repository does not promise employment. It promises a defined competency standard and a system for producing evidence that can be inspected.

## 1.4 Usage model

The product is designed for independent self-study without a required instructor.

This implies that every major module must provide enough information for a learner to answer:

- What am I expected to learn?
- What must I already know?
- What should I build or change?
- How do I verify it?
- What does failure mean?
- What should I revisit?
- What evidence must I retain?
- What unlocks next?

## 1.5 Language model

Teaching content is written in Vietnamese. English technical terms are retained and defined when first introduced.

Professional artifacts are written in English:

- Source code and identifiers
- Code comments where comments are justified
- README files
- Commit messages
- Issues
- Pull requests
- API documentation
- Architecture decision records
- Project case studies
- Remote-work communication exercises

This is not a fully duplicated bilingual curriculum. There is one curriculum source, not parallel Vietnamese and English versions that can drift.

## 1.6 Time model

The curriculum is competency-based rather than week-based.

A learner advances after meeting a gate contract, not after spending a prescribed number of weeks. Intensive, standard, and part-time schedules may later be published as planning aids, but they must not redefine completion.

---

# 2. Goals, non-goals, and success boundaries

## 2.1 Product goals

The repository must enable a learner to:

- Understand JavaScript as a runtime language before relying on TypeScript
- Understand browser, HTTP, and relational-database mechanisms before framework abstractions hide them
- Build a production-aware React SPA
- Build a production-aware Express modular monolith
- Model and query PostgreSQL directly before relying on an ORM-style layer
- Integrate frontend, backend, database, authentication, authorization, testing, and deployment
- Diagnose faults across system boundaries
- Respond to a change request after the first implementation
- Create a learner-owned portfolio repository with credible technical evidence
- Explain key technical decisions and trade-offs
- Use Git, GitHub, terminal, CI, and pull requests as professional skills rather than incidental tooling

## 2.2 Initial non-goals

The initial product does not build:

- A user-account system for the curriculum website
- Cloud progress storage
- A browser-hosted IDE
- A remote code-execution judge
- A public leaderboard
- Gamification or streak mechanics
- Automatically issued certificates
- A social feed
- A custom video-hosting platform
- A recruitment marketplace
- A fully integrated AI tutor
- A full learning-management system
- Microservices as a core architecture
- Multiple competing frontend or backend stacks in core

These are excluded because they add an operating platform that can consume more effort than the curriculum itself.

## 2.3 Completion is not reading

The product must not equate any of the following with verified competency:

```text
Reading all pages
Watching all demonstrations
Checking a local progress box
Passing only open happy-path tests
Producing a UI that appears to work
Copying a guided project
```

Verified competency requires evidence appropriate to the competency, normally combining implementation, diagnosis, explanation, adaptation, and mechanical verification.

---

# 3. Design principles

## 3.1 Competency before chronology

The canonical model is a directed acyclic graph of competencies and prerequisites. A default learning path is derived from the graph, but file order and week numbers are not the source of truth.

## 3.2 Foundations before frameworks

The curriculum teaches:

```text
JavaScript before TypeScript
DOM and browser behavior before React
HTTP primitives before Express
SQL and PostgreSQL before Drizzle
Separated client and server before Next.js
Manual application boundaries before NestJS
```

## 3.3 Runtime before static abstraction

TypeScript proves properties inferred from source code. It does not validate unknown runtime data.

Every boundary receiving data from HTTP, environment variables, storage, databases, or third-party services must use runtime parsing or validation.

## 3.4 Mechanism before convenience

Low-level mechanisms appear in bounded laboratories, not as the main application stack.

Examples:

- Node.js built-in HTTP APIs are used to observe request and response behavior
- `node-postgres` is used to observe parameterized queries, pooling, and explicit transactions
- Raw SQL is used to learn relational behavior and query semantics

The learner then uses Express and Drizzle for application development.

## 3.5 One primary stack

Core has one coherent stack:

```text
React + Vite
Express
PostgreSQL
Drizzle
TypeScript
```

Specializations compare additional frameworks against mechanisms already learned. They do not compete with core or become hidden capstone requirements.

## 3.6 Evidence before completion claims

A completion claim must point to a specific curriculum version, contract version, repository commit, and evidence set.

## 3.7 Repository skills are curriculum skills

Git, GitHub, terminal use, debugging, package management, CI, issue writing, pull-request writing, and code review are part of the curriculum outcome.

## 3.8 One source of truth

Curriculum facts live in `curriculum/`. The documentation website and published starter repositories consume or derive from that source.

No manually maintained duplicate curriculum is permitted inside the website application.

## 3.9 Fail closed

A validator crash, missing artifact, unresolved reference, publication leak, or failed required command is a failure. It must not silently degrade into a warning or success.

## 3.10 Scale only after proving the path

The project must not generate dozens of lessons or templates before a real learner can complete the current vertical path independently.

---

# 4. Curriculum architecture

## 4.1 Three separate roadmaps

The repository distinguishes:

```text
Development roadmap
└── The order maintainers build and publish the product

Default learning path
└── The recommended sequence presented to learners

Competency graph
└── The actual prerequisite relationships and gate requirements
```

Release 1 is a development vertical slice. It is not the final abbreviated curriculum.

## 4.2 Core gates

```text
Gate 0: Engineering readiness
Gate 1: Web and JavaScript foundations
Gate 2: TypeScript and software-engineering foundations
Gate 3: Production-aware React frontend
Gate 4: PostgreSQL and Express backend
Gate 5: Fullstack production integration
Gate 6: Capstone and career readiness
```

## 4.3 Mastery levels

Each competency declares a required mastery level:

```text
Level 0: Recognize
Level 1: Explain
Level 2: Implement
Level 3: Diagnose
Level 4: Design and justify
```

A lesson typically supports recognition or explanation. Focused exercises support implementation. Debugging tasks support diagnosis. Milestones and capstones can support design and justification.

Not every competency requires Level 4.

---

# 5. Gate 0 — Engineering readiness

## 5.1 Purpose

Verify that the learner can operate a modern JavaScript development environment independently.

## 5.2 Required competencies

```text
Development environment
├── Terminal fundamentals
├── Files, directories, and paths
├── Environment variables
├── Process exit codes
├── Editor setup
└── Browser developer-tools introduction

Git and GitHub
├── Repository
├── Commit
├── Branch
├── Merge
├── Pull request
├── Conflict resolution
└── Basic issue workflow

JavaScript tooling introduction
├── Node.js runtime
├── Package manager
├── package.json
├── Scripts
├── Semantic-version ranges
└── Lockfile purpose

Professional baseline
├── English identifiers
├── Commit-message conventions
├── README structure
├── Reproducible setup instructions
└── Evidence-backed technical questions
```

## 5.3 Gate artifact

A small command-line JavaScript repository with:

- Package scripts
- Automated test
- English README
- Feature branch
- Self-reviewed pull request
- Issue describing a defect or improvement
- CI for lint, test, and build or package validation

## 5.4 Fast-track behavior

Experienced learners may challenge the gate, but must still produce the artifact and evidence. “I already know Git” is not sufficient.

---

# 6. Gate 1 — Web and JavaScript foundations

## 6.1 Web platform

```text
HTML
├── Document structure
├── Semantic elements
├── Forms and native validation
├── Tables when semantically appropriate
├── Images and media
└── Accessibility semantics

CSS
├── Cascade and specificity
├── Inheritance
├── Box model
├── Normal flow
├── Flexbox
├── Grid
├── Responsive layout
├── Custom properties
└── Focus and interaction states

Browser
├── Parsing and rendering overview
├── DOM
├── Events
├── Forms
├── Storage boundaries
├── Fetch
├── Same-origin model
└── Developer tools
```

CSS is deep enough to produce responsive and accessible product interfaces, but core is not a professional visual-design curriculum.

## 6.2 JavaScript runtime

```text
Values
├── Primitive values
├── Object identity
├── Truthiness
├── Equality
├── Coercion
├── null and undefined
└── Number limitations

Execution
├── Scope
├── Lexical environments
├── Closures
├── Function values
├── this
├── Error propagation
└── Module evaluation

Object model
├── Properties
├── Prototype chain
├── Classes as syntax
├── Composition
├── Iterables
└── Built-in collections

Asynchronous execution
├── Call stack
├── Tasks and microtasks
├── Promise
├── async and await
├── Cancellation concepts
└── Race conditions in UI workflows

Organization
├── ES modules
├── Pure and impure functions
├── State boundaries
├── Dependency direction
├── Error handling
└── Testable design
```

## 6.3 Bridge notes from other languages

Lessons may contain short, targeted notes for learners coming from C++, Java, or Python when a likely misconception exists.

There are not three separate curricula. Bridge notes are used only where they prevent a concrete misunderstanding.

## 6.4 Gate artifact

A browser application written with HTML, CSS, and JavaScript without a frontend framework.

It must include:

- Semantic HTML
- Keyboard-accessible workflows
- Responsive layout
- Form validation
- Multiple UI states
- Module boundaries
- Appropriate local persistence
- Asynchronous interaction
- Unit tests for pure logic
- Browser acceptance tests for main workflows

## 6.5 Gate challenge

The learner diagnoses a broken JavaScript application, writes a regression test, identifies the root cause, applies a narrow fix, and explains the event, state, or asynchronous behavior involved.

---

# 7. Gate 2 — TypeScript and software-engineering foundations

## 7.1 Required competencies

```text
Type system
├── Inference
├── Annotations
├── Literal types
├── Union and intersection
├── Narrowing
├── Discriminated unions
├── Interface and type alias
├── Generics
├── keyof and indexed access
├── Utility types
├── unknown
├── never
└── Assertion risks

Compiler model
├── tsconfig
├── Strict mode
├── Module resolution
├── Source maps
├── Declaration files
└── Build versus type checking

Boundary design
├── Trusted internal values
├── Untrusted external values
├── Runtime validation
├── Parsing
├── Error representation
└── Contract ownership

Engineering practices
├── Package boundaries
├── Practical dependency inversion
├── Testing strategy
├── Refactoring under tests
├── Static analysis
└── Continuous integration
```

## 7.2 Gate artifact

A strict TypeScript package or small service with:

- Public API
- Discriminated unions for domain state
- Runtime parsing at external boundaries
- Unit tests
- Generated or property tests where they add value
- Consistent error representation
- English package documentation

## 7.3 Gate challenge

The learner repairs a project that incorrectly relies on `any`, unsafe assertions, unvalidated API data, misunderstood optional properties, or unnecessary generic abstractions.

---

# 8. Gate 3 — Production-aware React frontend

## 8.1 Required competencies

```text
React model
├── Rendering
├── Component identity
├── Props
├── State
├── Derived state
├── Effects
├── Refs
└── Composition

Application structure
├── Feature boundaries
├── Routing
├── Nested layouts
├── Shared UI versus domain UI
├── Server state
├── Client state
└── URL state

Product behavior
├── Forms
├── Runtime validation
├── Loading states
├── Empty states
├── Error states
├── Retry behavior
├── Authentication UI
└── Authorization-aware UI

Quality
├── Accessibility
├── Responsive behavior
├── Unit tests
├── Component integration tests
├── End-to-end workflows
├── Performance fundamentals
└── Production build and deployment
```

## 8.2 State-management progression

```text
Local state
→ Lifted state
→ Composition
→ Context for stable shared dependencies
→ Server-state library
→ Global client-state tool only when justified
```

The learner must classify state as server, URL, form, component, or shared client-domain state before selecting a tool.

## 8.3 Gate artifact

A React + TypeScript SPA with:

- Nested routing
- Server-state loading and invalidation
- Runtime-validated forms
- Authentication state
- Accessible interaction
- Responsive layout
- Error containment
- Unit, integration, and browser acceptance tests
- Production deployment

## 8.4 Change request

After initial completion, the learner receives a requirement that invalidates an earlier assumption, such as allowing users to belong to multiple workspaces with different roles.

The assessment checks whether the learner can update state, routing, query keys, contracts, and tests without rebuilding from a walkthrough.

---

# 9. Gate 4 — PostgreSQL and Express backend

## 9.1 Learning sequence

```text
PostgreSQL and SQL
→ node-postgres laboratory
→ Node.js HTTP laboratory
→ Express
→ Drizzle
→ Production-aware modular monolith
```

## 9.2 PostgreSQL foundation

```text
Relational modeling
├── Entities and relationships
├── Primary keys
├── Foreign keys
├── Unique constraints
├── Check constraints
├── Nullability
└── Practical normalization

Querying
├── SELECT
├── JOIN
├── Aggregation
├── Subquery
├── CTE
├── Window functions
├── Pagination trade-offs
└── Query-plan introduction

Correctness
├── Transactions
├── Atomicity
├── Isolation fundamentals
├── Concurrency anomalies
├── Constraint-driven integrity
└── Migration safety

Performance
├── Index fundamentals
├── Selectivity
├── Composite indexes
├── N+1 queries
└── Measuring before optimizing
```

## 9.3 Low-level laboratories

The `node-postgres` laboratory covers:

- Parameterized queries
- Connection pooling
- Explicit transactions using one client
- Rollback
- Constraint errors
- Mapping rows to domain values

The Node.js HTTP laboratory covers:

- Request methods and URLs
- Headers
- Status codes
- Response bodies
- Streams
- Cancellation
- Error responses

These laboratories are bounded. The capstone backend uses Express and Drizzle.

## 9.4 Modular monolith boundaries

```text
Transport layer
├── Routes
├── Controllers
├── Request parsing
└── Response mapping

Application layer
├── Use cases
├── Authorization decisions
├── Transaction boundaries
└── Workflow orchestration

Domain layer
├── Business rules
├── Domain state
└── Domain errors

Infrastructure layer
├── Drizzle repositories
├── External services
├── Logging
└── Configuration
```

These boundaries are guidelines, not a demand to create four directories for every small feature.

## 9.5 Required backend capabilities

- HTTP semantics
- REST resource design
- Runtime validation
- Authentication
- Resource- and role-based authorization
- Secure password handling
- Session or credential lifecycle
- Error classification
- Structured logging
- Configuration validation
- Database transactions
- API documentation
- Unit and integration tests
- Security fundamentals
- Graceful startup and shutdown
- Production deployment

## 9.6 Gate artifact

A transactional workflow API such as booking, enrollment, ordering, or approval.

It must include:

- At least one invariant enforced by a database constraint
- At least one workflow requiring a transaction
- Authentication
- An authorization matrix
- Filtering and pagination
- Migrations
- Integration tests using real PostgreSQL
- Structured error responses
- API documentation
- Deployment

## 9.7 Failure-recovery assessment

The learner explains and tests behavior when:

- The database is unavailable
- A constraint is violated
- A transaction fails midway
- Input is invalid
- An authenticated user lacks permission
- A request is repeated
- A migration conflicts with existing data

---

# 10. Gate 5 — Fullstack production integration

## 10.1 Purpose

This gate evaluates problems that appear only when frontend, backend, database, identity, and deployment interact.

## 10.2 Required competencies

```text
Client-server integration
├── Contract ownership
├── Request and response validation
├── Error mapping
├── Cache invalidation
├── Optimistic behavior when justified
└── Version compatibility

Authentication
├── Login lifecycle
├── Logout lifecycle
├── Credential-storage boundaries
├── Expiration
├── Renewal model
├── CSRF considerations
└── Cross-origin configuration

Authorization
├── Frontend affordances
├── Backend enforcement
├── Resource ownership
├── Role permissions
└── Negative test cases

Production quality
├── Environment separation
├── Secret handling
├── Migration deployment
├── CI quality gates
├── Logging
├── Health checks
├── Accessibility checks
├── Security checks
└── Rollback reasoning
```

## 10.3 Fullstack milestone

The learner deploys:

- A frontend
- A backend API
- A PostgreSQL database
- A migration workflow
- A CI pipeline
- API documentation
- An architecture overview
- An operational runbook
- An evidence package

## 10.4 Incident assessment

A simulated incident crosses layers, for example duplicated bookings caused by repeated submissions on a slow network.

The learner must reason about:

- Submission state
- Retry behavior
- HTTP requests
- Idempotency
- Transactions
- Unique constraints
- Error responses
- Logging
- Regression tests

---

# 11. Gate 6 — Capstone and career readiness

## 11.1 Capstone model

The engineering contract is standardized. The product domain is selected by the learner.

### Required engineering contract

```text
React + TypeScript SPA
Express + TypeScript API
PostgreSQL + Drizzle
Authentication
Authorization
Relational data model
Transactional workflow
Search, filtering, and pagination
Runtime validation
Error handling
Automated tests
CI and deployment
API documentation
Architecture documentation
```

### Domain options

Examples include:

- Education
- Productivity
- Commerce
- Booking
- Community
- Content management
- Another domain that passes scope review

## 11.2 Proposal gate

The learner must submit before implementation:

- Problem statement
- Target users
- Primary workflows
- Non-goals
- Data model
- Authorization matrix
- API boundaries
- Transactional workflow
- Risk register
- Testing strategy
- Deployment plan
- Milestone breakdown

A proposal fails when it is only a feature list, is far too large, is trivial CRUD without workflow, avoids authorization, lacks meaningful relational modeling, or copies a guided project domain.

## 11.3 Capstone milestones

```text
Milestone 1: Architecture skeleton
Milestone 2: Core data model and migrations
Milestone 3: Authentication and authorization
Milestone 4: Primary transactional workflow
Milestone 5: Production-aware frontend
Milestone 6: Testing and hardening
Milestone 7: Deployment and documentation
Milestone 8: Change request and final review
```

Each milestone is normally represented by a separate pull request.

## 11.4 Career evidence package

```text
Public repository
Deployed application
English README
Architecture document
API documentation
Test evidence
CI history
Selected pull requests
Incident or debugging report
Project case study
CV-ready project description
```

## 11.5 Vietnam track

- CV in Vietnamese or English as appropriate
- Concise project explanation
- JavaScript, React, Node.js, SQL, and Git review
- Live technical interview practice
- Common coding-test preparation

## 11.6 Remote international track

- English CV and portfolio
- Asynchronous written communication
- English issues and pull requests
- English architecture explanations
- Recorded project walkthrough
- Time-zone and handoff practices
- Evidence-based behavioral interviewing

---

# 12. Specialization rules

A specialization must declare explicit core prerequisites and must not become a core completion dependency.

Example:

```yaml
id: specialization.nextjs
requires:
  - react.application.production-spa
  - http.client-server-boundary
  - api.runtime-validation
  - deployment.environment-boundaries
coreCompletionRequired: false
capstoneRequired: false
```

Every specialization must:

- Compare its abstractions with core mechanisms
- Avoid reteaching the entire foundation
- End in a bounded migration or project
- Explain what the framework provides, hides, and trades away
- Avoid adding reverse dependencies into core

Approved specialization positioning:

- Next.js after separated React and Express architecture
- NestJS after Express modular-monolith experience
- Prisma after SQL, `node-postgres`, and Drizzle
- Redis, queues, realtime, storage, and observability after backend core
- Design systems, advanced accessibility, performance, i18n, and offline-first after React core

---

# 13. Curriculum domain model

## 13.1 Core entities

| Entity | Responsibility |
|---|---|
| `Track` | A major learning route such as core or a specialization |
| `Competency` | A verifiable capability |
| `Module` | A coherent group of outcomes and activities |
| `Lesson` | An explanation and worked mental model |
| `Exercise` | Focused implementation practice |
| `Laboratory` | Observation of a mechanism |
| `DebuggingTask` | Diagnosis and root-cause repair |
| `Project` | Multi-competency product work |
| `Assessment` | A verification contract |
| `Rubric` | Observable engineering-quality criteria |
| `EvidenceRequirement` | Evidence that must be retained |
| `Milestone` | A gate for a group of competencies |

## 13.2 Stable identifiers

Every entity has a stable semantic ID independent of title, file path, week, and website URL.

Examples:

```text
js.runtime.coercion
ts.narrowing.discriminated-union
react.state.ownership
http.cache.invalidation
api.authz.resource-ownership
db.transaction.atomic-workflow
```

Renaming a title or moving a file does not change the semantic ID.

## 13.3 Publication states

```text
draft
├── Validated locally
├── Visible in development
└── Excluded from production

review
├── Included in pull-request previews
├── Excluded from production completion
└── Not a valid prerequisite for published completion

published
├── Included in production and search
└── Eligible for published prerequisite graphs

deprecated
├── URL retained
├── Replacement or migration note required
└── Not used for new prerequisite relationships

withdrawn
├── Removed from the active curriculum
└── URL explains the reason
```

Published content may not depend on a draft prerequisite.

## 13.4 Graph validation

The curriculum graph validator checks:

- Missing IDs
- Duplicate IDs
- Direct and indirect cycles
- Orphan competencies
- Unreachable milestones
- Invalid publication-state edges
- Invalid specialization dependencies
- Required competencies without assessments
- Required competencies without remediation routes

---

# 14. Standard module and lesson contracts

## 14.1 Module contract

```text
Why this matters
Learning outcomes
Prerequisites
Entry diagnostic
Concept lessons
Worked examples
Focused exercises
Mechanism laboratory when applicable
Debugging task
Applied project or task
Knowledge check
Interview prompts
Milestone assessment
Evidence requirements
Remediation paths
```

A small module need not contain a full project, but it must contain application and verification.

## 14.2 Lesson contract

```text
1. Problem
2. Mental model
3. Minimal example
4. Counterexample when useful
5. Applied example
6. Checkpoint
7. Common failures
8. Summary
9. Next dependency
```

A lesson has one primary objective. A large file covering closures, prototypes, the event loop, and promises at once violates the scope principle.

## 14.3 Markdown-first policy

- Markdown is the default format
- MDX is allowed only for genuinely interactive content
- Basic callouts, tables, code, headings, and links do not justify MDX
- Content must remain readable in GitHub and reviewable as text diffs

---

# 15. Learning artifacts and assessment architecture

## 15.1 Assessment dimensions

The system evaluates separately:

```text
Correctness
Robustness
Engineering quality
Understanding
```

Passing tests does not automatically prove good architecture, security, accessibility, or understanding.

## 15.2 Artifact types

| Artifact | Main purpose | Typical level |
|---|---|---:|
| `knowledge-check` | Mental-model validation | Explain |
| `focused-exercise` | Narrow implementation practice | Implement |
| `mechanism-lab` | Observe runtime or system behavior | Explain, Diagnose |
| `debugging-task` | Reproduce and fix a defect | Diagnose |
| `refactoring-task` | Improve design without changing behavior | Diagnose, Design |
| `change-request` | Adapt to a changed requirement | Diagnose, Design |
| `guided-project` | Integrate skills with declining scaffolding | Implement |
| `milestone-project` | Verify a competency group | Diagnose, Design |
| `capstone` | Verify integrated fullstack ability | Design and justify |
| `career-artifact` | Communicate technical evidence | Communicate |

## 15.3 Focused exercise contract

Each focused exercise must provide:

- One primary objective
- Observable acceptance criteria
- A starter that fails for the intended reason
- At least one edge or negative case
- Independent execution
- A single `verify` command
- Progressive hints
- A reference solution where permitted
- An explanation of why the solution works

Tests must verify behavior and contract rather than variable names, arbitrary file structure, or similarity to the reference solution.

## 15.4 Mechanism laboratory contract

A laboratory requires the learner to:

1. Predict behavior
2. Run the experiment
3. Record actual observations
4. Compare prediction and result
5. Explain discrepancies
6. Change one variable and predict again

Output screenshots alone do not complete a laboratory.

## 15.5 Debugging task contract

```text
Reproduce
→ Minimize
→ Add regression test
→ Form a working theory
→ Collect evidence
→ Reject weaker theories
→ Fix root cause
→ Explain remaining uncertainty
```

A debugging report records symptom, reproduction, evidence, theory, rejected theories, fix, regression test, and uncertainty.

## 15.6 Change requests

Every major milestone receives a post-implementation change request that invalidates at least one original assumption.

This is a primary defense against tutorial copying because the learner must adapt their own design.

## 15.7 Guided projects

Scaffolding decreases through checkpoints:

```text
Checkpoint 1: Structure and interfaces supplied
Checkpoint 2: Acceptance criteria supplied
Checkpoint 3: Learner chooses module boundaries
Checkpoint 4: Unguided change request
```

Guided projects must not reduce to “open file X and paste code Y.”

---

# 16. Multi-layer verification

## 16.1 Verification layers

```text
Layer 1: Open automated tests
├── Correctness
├── Edge cases
├── API contracts
└── Regression protection

Layer 2: Static verification
├── Type checking
├── Linting
├── Formatting
├── Dependency rules
├── Security checks
└── Build validation

Layer 3: Product acceptance tests
├── Browser workflows
├── API integration
├── Database behavior
└── Authentication scenarios

Layer 4: Structured rubric
├── Architecture
├── Accessibility
├── Error states
├── Security
├── Documentation
├── Git workflow
└── Technical explanation

Layer 5: Evidence package
├── Repository link
├── Deployment
├── Test report
├── Architecture document
├── Pull-request history
└── Demo or walkthrough
```

Focused exercises use a subset. Milestones and capstones use all relevant layers.

## 16.2 Critical criteria

A milestone cannot pass by averaging away a critical failure.

Examples of critical failures:

- Authorization enforced only in the frontend
- Password storage is unsafe
- A transaction can leave partial state
- The primary workflow is not keyboard accessible
- A fresh clone cannot run
- Credentials are committed
- Required negative tests are absent

## 16.3 Rubric scale

```text
0: Missing or incorrect
1: Partial
2: Meets the required standard
3: Strong evidence beyond the minimum
```

Completion requires every critical and required dimension to reach at least 2, with no unresolved blocker and a valid evidence package.

A single total score such as `82/100` is not the completion gate.

## 16.4 Progressive disclosure

```text
Level 0: Problem, references, criteria, and open tests
Level 1: Conceptual hint
Level 2: Diagnostic hint
Level 3: Structural guidance or pseudocode
Level 4: Reasoning walkthrough
Level 5: Reviewed reference implementation
```

Availability depends on artifact type:

- Focused exercises may expose full solutions
- Laboratories may expose expected observations and walkthroughs
- Guided projects may expose checkpoint solutions
- Milestones expose architecture notes and selected excerpts, not a complete submission
- Capstones do not expose a complete same-domain implementation
- Maintainer-only fixtures may remain private

A static public website can sequence disclosure but cannot securely lock public source. The design relies on adaptive tasks and explanation rather than false secrecy.

---

# 17. Evidence model

## 17.1 Evidence package structure

```text
evidence/
├── manifest.yaml
├── verification/
│   ├── test-summary.md
│   ├── accessibility-summary.md
│   └── security-summary.md
├── architecture/
│   ├── overview.md
│   ├── data-model.md
│   └── authorization-matrix.md
├── decisions/
│   └── adr-*.md
├── debugging/
│   └── incident-*.md
├── pull-requests/
│   └── selected-prs.md
└── demo/
    └── walkthrough.md
```

## 17.2 Trust levels

```text
Self-reported
Repository-verifiable
CI-verified
Externally observable
Human-reviewed
```

A self-reported checklist must not receive a generic `verified` label.

## 17.3 Version linkage

Evidence records:

- Curriculum version
- Template version
- Exercise, rubric, and evidence contract versions
- Repository URL
- Exact commit
- CI run
- Deployment URLs where applicable

## 17.4 Competency states

```text
not-started
→ learning
→ attempted
→ needs-remediation
→ attempted
→ verified
→ superseded
```

A new curriculum release does not silently erase older evidence. Older evidence remains tied to the contract it satisfied.

## 17.5 Remediation

A failed assessment returns:

- Passed criteria
- Failed criteria
- Blocking criteria
- Related competencies
- Recommended lessons
- Focused exercises
- Retake requirements

The learner repeats only the relevant part unless the deficiency invalidates the whole artifact.

---

# 18. Repository architecture

## 18.1 Architectural layers

```text
Curriculum source
        ↓
Domain schemas, loaders, graphs, and validators
        ↓
Documentation adapter and learning-artifact adapters
        ↓
Generated website and published starter repositories
```

The website consumes domain packages. Domain packages never depend on the website.

## 18.2 Proposed source tree

```text
fullstack-javascript-roadmap/
├── apps/
│   └── docs/
├── curriculum/
│   ├── tracks/
│   ├── competencies/
│   ├── modules/
│   ├── lessons/
│   ├── assessments/
│   ├── career/
│   └── specializations/
├── exercises/
├── projects/
│   ├── laboratories/
│   ├── guided/
│   ├── milestones/
│   └── capstone/
├── templates/
├── solutions/
│   ├── exercises/
│   ├── laboratories/
│   └── guided-projects/
├── packages/
│   ├── curriculum-schema/
│   ├── curriculum-loader/
│   ├── curriculum-graph/
│   ├── exercise-contract/
│   ├── exercise-runner/
│   ├── rubric-schema/
│   ├── evidence-schema/
│   ├── template-builder/
│   ├── validation-core/
│   └── shared-config/
├── tooling/
│   ├── validate-content/
│   ├── validate-links/
│   ├── validate-examples/
│   ├── publish-templates/
│   ├── generate-catalog/
│   └── release/
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── contributing/
│   ├── authoring/
│   └── superpowers/specs/
├── fixtures/
│   ├── valid/
│   └── invalid/
├── scripts/
├── .github/
├── AGENTS.md
├── CONTRIBUTING.md
├── README.md
└── LICENSE
```

Only directories needed for the current release are created. The tree is a target architecture, not a requirement to commit empty folders.

## 18.3 Boundary rules

### `curriculum/`

Contains educational content and metadata only. It does not contain website UI logic, build scripts, or large reference implementations.

### `exercises/`

Contains independently executable focused exercises with declared dependencies and commands.

### `projects/`

Contains laboratories, guided projects, milestone contracts, and capstone contracts.

### `templates/`

Contains source material for generated public starter repositories. It is not itself the public learner repository.

### `packages/`

Contains reusable domain and validation logic with explicit interfaces. No package depends on `apps/docs`.

### `solutions/`

Contains only solutions approved for public progressive disclosure. Complete milestone and capstone submissions are excluded.

### Private fixtures

Hidden validation fixtures, if used, live outside public output and are accessible only to the required protected workflow.

---

# 19. Documentation website

## 19.1 Product model

The repository is the source of truth. The website is the primary reading interface.

```text
D is the architecture
B is the learner experience
```

The site provides documentation-grade navigation without replacing real Git, terminal, editor, and repository work.

## 19.2 Technology baseline

The approved direction is:

```text
Astro + Starlight
Markdown-first content
Static output
Search
Generated navigation from curriculum metadata
React islands only when interaction materially requires them
```

## 19.3 Curriculum loading

Preferred path:

```text
curriculum/
→ curriculum loader
→ validated content collection
→ Starlight pages
```

A Release 0 spike must prove that content outside `apps/docs` can be loaded, validated, rendered, navigated, and hot-reloaded.

If direct integration is blocked by Starlight assumptions, an acceptable fallback generates a deterministic temporary directory:

```text
.generated/starlight-content/
```

The directory is never committed and never edited manually. A manually maintained second curriculum copy is prohibited.

## 19.4 Initial information architecture

```text
/
/roadmap/
/gates/{gate-id}/
/modules/{module-id}/
/lessons/{lesson-slug}/
/competencies/{competency-id}/
/projects/{project-id}/
/specializations/
/career/
```

## 19.5 Release 1 website capabilities

Required:

- Core path and gate navigation
- Module navigation
- Previous and next dependency links
- Full-text search
- Competency index
- Reverse dependencies
- Table of contents
- Syntax highlighting
- Source links
- Review metadata
- Starter links
- Progressive hint disclosure
- Rubric rendering
- Evidence requirements
- Responsive layout
- Keyboard navigation
- Light and dark themes
- Static generation

Excluded:

- Accounts
- Cloud progress
- Public profiles
- Online editor
- Remote test execution
- Leaderboard
- Certificates
- Social features

Local progress checkboxes, if later added, are convenience state and never convert a competency to verified.

---

# 20. Technology and tooling baseline

## 20.1 Runtime policy

Use the Node.js 24 LTS release family for the initial production baseline.

The exact patch is pinned during WP-00 after checking the current security release. The design does not freeze a patch number because runtime security updates must be applied before bootstrap evidence is recorded.

`package.json` permits the supported Node.js 24 family, while CI and provenance record the exact tested patch.

## 20.2 Package manager

Use a pnpm workspace.

Requirements:

- Pin the exact pnpm version with `packageManager`
- Commit `pnpm-lock.yaml`
- Use frozen installs in CI
- Use `workspace:` for internal packages
- Enable workspace-cycle failure
- Fail filtered commands when no package matches
- Centralize shared dependency versions where pnpm catalogs add clarity

## 20.3 Task orchestration

Do not add Turborepo, Nx, or another task orchestrator in Release 0.

pnpm workspace scripts are sufficient until measurement shows that CI cost or repeated work justifies caching and task-graph infrastructure.

A task runner may be introduced only when inputs, outputs, determinism, cache correctness, and a measured performance problem are documented.

## 20.4 Schema strategy

```text
TypeScript and Zod runtime schemas
→ Generated TypeScript consumer types
→ Generated JSON Schema for editors and external tools
→ Valid and invalid fixtures
```

Schema validation, semantic validation, graph validation, and artifact execution are separate layers.

## 20.5 Test stack

```text
Vitest
├── Domain unit tests
├── Schema and graph tests
├── Exercise tests
├── React component integration
└── Backend tests that do not require a browser

Playwright
├── Documentation acceptance
├── Keyboard workflows
├── React E2E
├── Fullstack browser workflows
└── Authentication scenarios

Real PostgreSQL
├── Repository integration tests
├── Transaction tests
├── Migration tests
└── PostgreSQL-specific behavior
```

SQLite does not substitute for PostgreSQL when the assessment concerns PostgreSQL constraints, transactions, isolation, indexes, plans, or migrations.

## 20.6 Browser matrix

- Pull requests: Chromium
- Nightly or release: Chromium, Firefox, and WebKit

## 20.7 Cross-platform contract

Primary supported environments:

- Windows 11
- Linux

Secondary:

- macOS

Rules:

- Avoid Bash-only package scripts
- Use Node.js scripts for cross-platform automation
- Do not concatenate paths manually
- Normalize line endings
- Do not require undeclared global tools
- Document PowerShell equivalents when shell syntax differs
- Smoke-test published starters on Windows and Linux

## 20.8 Root command contract

```text
pnpm dev
pnpm check
pnpm test
pnpm verify
pnpm verify:templates
pnpm verify:release
```

Every learner starter also exposes a single:

```text
pnpm verify
```

The exact internal task list may vary, but the public command contract stays stable within a contract version.

---

# 21. Validation and diagnostics

## 21.1 Build flow

```text
Author change
→ Schema validation
→ Semantic and graph validation
→ Code-example and artifact validation
→ Documentation build
→ Starter build
→ Independent starter verification
```

## 21.2 Diagnostic structure

Every validation failure includes:

- Stable error code
- Location
- Observed value
- Expected contract
- Reason
- Suggested remediation
- Documentation reference

Severity:

```text
error   → CI fails
warning → Maintainer judgment required
notice  → Informational improvement
```

## 21.3 Required negative fixtures

Every important validator includes intentional invalid fixtures, including:

- Missing reference
- Duplicate ID
- Direct cycle
- Indirect cycle
- Published-to-draft dependency
- Invalid rubric critical criterion
- Invalid evidence manifest
- Solution leak
- Secret-like value
- Symlink escape
- Internal-only reference
- Validator crash path

A validator tested only with valid input is not trusted.

---

# 22. Starter repository architecture

## 22.1 Ownership model

```text
Monorepo template source
→ Deterministic generation
→ Public GitHub template repository
→ Learner-created independent repository
```

Public starter repositories are generated artifacts. They are not edited manually.

Learner repositories are owned by learners and are never silently overwritten by template updates.

## 22.2 Initial starter set

Long-term candidates:

- `javascript-engineering-starter`
- `typescript-package-starter`
- `react-spa-starter`
- `express-api-starter`
- `postgresql-laboratory-starter`
- `fullstack-capstone-starter`

Release 1 publishes only what it actually uses:

- `javascript-engineering-starter`
- `fullstack-vertical-slice-starter`

## 22.3 Publication policy

Publication uses an allowlist, not only a blocklist.

Pipeline:

```text
Validate source template
→ Materialize clean directory
→ Apply deterministic transforms
→ Scan for leaks and secrets
→ Fresh install
→ Check, test, and build
→ Verify generated manifest
→ Compare file allowlist
→ Publish immutable release
→ Update public template repository
```

## 22.4 Provenance

Every generated starter contains:

```text
.roadmap/template-manifest.json
```

It records:

- Template ID and version
- Curriculum version
- Source repository and commit
- Generation timestamp
- Exercise, rubric, and evidence contract versions
- Exact tested runtime and package-manager versions

## 22.5 Learner repository lifecycle

```text
Create from template
→ Verify environment
→ Baseline commit
→ Issue
→ Feature branch
→ Implementation and tests
→ Pull request
→ Self-review against rubric
→ CI
→ Merge
→ Evidence update
→ Change request
→ Final verification
```

## 22.6 Update policy

Learner repositories are not auto-updated from the template.

Updates are classified as:

- Documentation correction
- Non-breaking tooling fix
- Security fix
- Contract correction
- Breaking curriculum change

A release provides changelog, migration instructions, patch commits or comparison branches, affected versions, and verification instructions.

## 22.7 Leak prevention

Never publish:

```text
solution/
solutions/
private-fixtures/
maintainer-tests/
answer-key/
internal-review/
```

The scanner also detects:

- Maintainer markers
- Internal repository URLs
- Secret patterns
- Hidden answer content
- Absolute local paths
- Symlink escapes
- Unapproved submodules
- Indirect imports of private tests

---

# 23. Codex workflow and governance

## 23.1 Role

Codex is a scoped engineering contributor. It is not an autonomous product owner or release authority.

Human maintainers approve:

- Product direction
- Architecture
- Curriculum contracts
- Merge decisions
- Releases

Codex may:

- Explore repository context
- Implement bounded task contracts
- Add and run tests
- Review diffs
- Produce evidence reports

Codex may not independently:

- Expand curriculum scope
- Add a framework or database
- Change stable IDs
- Lower quality gates
- Delete failing tests
- Rewrite rubrics to match its implementation
- Publish templates
- Mark competencies verified
- Create production releases

## 23.2 Two work lanes

```text
Engineering lane
├── Website
├── Schemas
├── Validators
├── Runner
├── Publisher
├── CI
└── Release tooling

Curriculum lane
├── Competencies
├── Lessons
├── Exercises
├── Laboratories
├── Projects
├── Rubrics
└── Career materials
```

A single task should have one primary verifiable outcome.

## 23.3 Task contract

Every Codex task includes:

```text
Objective
Context
In scope
Out of scope
Allowed files or boundaries
Required behavior
Failure behavior
Acceptance criteria
Commands to run
Evidence required
Constraints
Open blockers
```

## 23.4 Task states

```text
proposed
planned
ready
in-progress
blocked
implemented
under-review
needs-changes
verified
merged
withdrawn
```

`implemented` and `verified` are explicitly different.

## 23.5 Agent roles

Initial roles:

- `context-explorer`
- `implementer`
- `test-reviewer`
- `architecture-reviewer`
- `curriculum-reviewer`
- `security-reviewer`
- `release-verifier`

The implementer’s self-check is not the only review evidence for its own change.

## 23.6 Risk levels

| Risk | Example | Minimum review |
|---|---|---|
| `R0` | Typo or clear broken link | Self-check and targeted CI |
| `R1` | Small lesson or exercise | Curriculum review and relevant tests |
| `R2` | Package logic or website feature | Independent review and package tests |
| `R3` | Schema, graph, template publisher | Architecture review, negative fixtures, full verify |
| `R4` | Authentication, publication, release tooling | Security review, clean-room verification, human approval |

## 23.7 `AGENTS.md` hierarchy

Root `AGENTS.md` defines repository-wide rules.

Scoped files define domain-specific rules:

```text
curriculum/AGENTS.md
exercises/AGENTS.md
projects/AGENTS.md
templates/AGENTS.md
apps/docs/AGENTS.md
packages/AGENTS.md
tooling/AGENTS.md
```

A policy has one authoritative location. Prompts may reference it but should not duplicate entire policies that can drift.

## 23.8 Sandbox and credentials

Default:

- Write only in the current worktree
- Network disabled unless explicitly required
- No production credentials
- No deployment permission
- No remote Git mutation during implementation
- Package installation from the approved lockfile workflow

Build and publication are separate. Agents may produce a dry run but do not publish without an explicit protected action.

## 23.9 Worktrees and parallelism

- One independent task per branch or worktree
- No multiple agents editing one worktree
- Parallel work only when files and unsettled contracts do not overlap
- Do not scale curriculum authoring while schemas are unstable

## 23.10 Implementation protocol

```text
Read contract
→ Inspect context
→ Restate behavior
→ Identify acceptance tests
→ Add or confirm failing test
→ Implement smallest coherent change
→ Run targeted verification
→ Run broader verification
→ Review diff
→ Produce evidence report
```

## 23.11 Prohibited shortcuts

- Skipping, deleting, or weakening failing tests
- Replacing PostgreSQL integration with mocks merely to avoid setup
- Turning errors into warnings without approval
- Catching and hiding failures broadly
- Using `any` or assertions only to silence TypeScript
- Committing generated dependencies
- Hard-coding fixtures into implementation
- Copying solutions into learner starters
- Changing acceptance criteria after implementation
- Claiming success from partial output
- Assuming an untested operating system works
- Publishing from a dirty tree
- Overwriting unrelated user changes

## 23.12 Verification report

Every significant task reports:

- Objective
- Changed behavior
- Files changed
- Exact commands and exit results
- Acceptance-criterion evidence
- Unverified areas
- Known limitations
- Follow-up issues

---

# 24. Release roadmap

## 24.1 Release 0 — Repository kernel

### Objective

Prove the repository architecture before scaling content.

### Scope

```text
Repository foundation
Governance
Curriculum schemas
Curriculum graph
Assessment schemas
Starlight loader spike
Exercise runner
Rubric and evidence kernel
Template builder
Leak prevention
Cross-platform CI
Vertical-slice skeleton
```

### Work packages

```text
WP-00 Repository bootstrap
WP-01 Governance kernel
WP-02 Curriculum schemas
WP-03 Curriculum graph
WP-04 Documentation loader spike
WP-05 Exercise contract and runner
WP-06 Rubric and evidence kernel
WP-07 Template builder
WP-08 Leak and secret prevention
WP-09 Cross-platform CI
WP-10 Vertical-slice skeleton
```

### Dependency order

```text
WP-00
→ WP-01
→ WP-02
→ WP-03
→ WP-04, WP-05, WP-06 where independent
→ WP-07
→ WP-08
→ WP-09
→ WP-10
```

### Exit criteria

From a fresh clone on Windows and Linux:

```text
pnpm install
pnpm check
pnpm test
pnpm verify
pnpm verify:templates
```

must pass.

The release also proves:

- Curriculum content outside the website app renders in Starlight
- Missing IDs and dependency cycles fail CI
- Published-to-draft references fail CI
- Intentional solution leaks fail publication
- Generated starters have no monorepo dependency
- Provenance is correct
- Validator crashes fail closed
- Diagnostics include location, contract, and remediation

## 24.2 Release 1 — End-to-end vertical slice

### Objective

Prove the entire learner loop:

```text
Read
→ Practise
→ Build
→ Verify
→ Debug
→ Adapt
→ Deploy
→ Produce evidence
```

### Reference domain

Use a bounded **Workshop Enrollment** application.

Learner-facing workflows:

- Create account
- Log in
- Browse workshops
- Search and filter
- Enroll when capacity exists
- Cancel enrollment
- View own enrollments

Admin workflows:

- Create and update workshops
- View enrollment counts
- Close enrollment

The domain exercises React states, Express contracts, PostgreSQL constraints, transactions, duplicate requests, authorization, and deployment without becoming a commercial product.

### Vertical modules

```text
Module 0: Engineering baseline
Module 1: JavaScript essentials
Module 2: Browser interaction
Module 3: TypeScript bridge
Module 4: React SPA
Module 5: HTTP and Express
Module 6: PostgreSQL
Module 7: Fullstack integration
Module 8: Mini-capstone
```

### Required assessments

- JavaScript closure exercise
- Event-loop laboratory
- TypeScript untrusted-data parser
- React form with loading, validation, and server errors
- Express validation and structured errors
- PostgreSQL rollback laboratory
- Duplicate-enrollment debugging task
- Multi-session workshop change request
- Deployed mini-capstone with evidence package

### Exit criteria

- A target learner can begin from the website
- The public starter works from a fresh creation
- Every documented command works
- Starter tests fail for intended reasons
- Reference implementations pass the same public verifier
- Hints support useful remediation
- The mini-capstone is deployed
- Evidence points to an exact commit
- The change request has no complete walkthrough
- A fresh learner completes the path without undocumented maintainer help

Release 1 is labeled a technical preview, not a complete junior curriculum.

## 24.3 Release 2 — Engineering, web, and JavaScript foundations

Completes Gate 0 and Gate 1, including diagnostics, fast-track assessments, vanilla JavaScript milestone, debugging, and remediation.

## 24.4 Release 3 — TypeScript and production-aware React

Completes Gate 2 and Gate 3, including runtime boundaries, React state ownership, routing, server state, forms, accessibility, testing, deployment, and a post-build change request.

## 24.5 Release 4 — PostgreSQL and Express backend

Completes Gate 4, including relational modeling, constraints, queries, transactions, migration safety, Node.js mechanisms, Express modular boundaries, security, structured logging, testing, and deployment.

## 24.6 Release 5 — Fullstack, capstone, and career readiness

Completes Gate 5 and Gate 6, including integrated authentication and authorization, environment and deployment concerns, proposal-gated capstone, evidence package, Vietnam job preparation, and remote international preparation.

## 24.7 Release 6 and later — Specializations

A specialization starts only when:

- Its core prerequisites are published
- Learner demand is clear
- Maintainer capacity exists
- It has a bounded project
- It compares itself to core mechanisms
- It does not change the core capstone contract

---

# 25. Versioning and maturity

## 25.1 Product versions

```text
0.x  → Contracts and curriculum may still break with migration notes
1.0  → Core Gate 0–6 complete and validated
1.x  → Backward-compatible curriculum improvements
2.0  → Breaking curriculum or evidence-contract revision
```

## 25.2 Content maturity

```text
experimental → No learner dry run yet
reviewed     → Technical and curriculum review complete
validated    → Successful target-learner dry run
stable       → Multiple completion cycles
```

`published` does not mean `stable`.

## 25.3 Definition of 1.0

Product:

- Target learner and outcome remain coherent
- Core has one stack
- Non-goals remain enforced

Curriculum:

- Gate 0–6 complete
- Required graph reachable
- No required placeholders
- Fast-track assessments exist
- Remediation paths exist

Assessment:

- Critical criteria map to evidence
- Milestones include change requests
- Capstone includes proposal gate
- Evidence is versioned

Engineering:

- Windows and Linux are supported
- Static website builds reliably
- Templates generate and verify independently
- Publication fails closed
- Migration process is tested

Validation:

- At least three independent end-to-end completions by target learners
- Repeated blockers addressed
- No completion depends on undocumented maintainer intervention

Three learners do not prove broad educational effectiveness. They are a minimum guard against declaring an unused curriculum stable.

---

# 26. Pilot learner protocol and metrics

## 26.1 Pilot participant

A pilot learner:

- Knows basic C++, Python, Java, or comparable programming
- Has no substantial fullstack experience
- Can use a personal development machine
- Agrees to report blockers and misconceptions

A repository contributor familiar with internals cannot be the only pilot learner.

## 26.2 Data collection

Collect only data tied to an actionable decision:

```text
Setup
├── Fresh-install failures
├── Operating system
└── Missing assumptions

Learning
├── Repeated misconceptions
├── Lessons reopened
├── Hint levels used
└── Tasks requiring outside help

Assessment
├── False-positive tests
├── False-negative interpretation
├── Unclear criteria
└── Remediation effectiveness

Product
├── Navigation failures
├── Broken links
├── Accessibility blockers
└── Starter problems
```

## 26.3 Meaningful metrics

Engineering:

- Fresh-clone success
- Cross-platform verification
- Broken links
- Schema drift
- Template leaks
- Flaky tests
- Publication reproducibility

Curriculum:

- Prerequisite blockers
- Repeated misconception patterns
- Assessment false positives and false negatives
- Hint escalation
- Remediation success
- Independent completions

Career evidence:

- Deployed applications
- Valid evidence packages
- Architecture explanations
- Change-request completions
- Negative authorization tests
- Pull-request histories
- Portfolio-ready descriptions

Stars, page views, number of lessons, lines of content, and technology count may measure reach or activity, but they do not prove competency outcomes.

---

# 27. Risk register and stop conditions

## 27.1 Primary risks

| Risk | Early signal | Control |
|---|---|---|
| Scope expansion | Specializations begin before core | Release gates and explicit non-goals |
| Platform dominates curriculum | Most work is website UI | Static-first feature budget |
| Schema churn | Repeated migrations before first slice | Fixtures and Release 1 proof |
| Shallow generated content | Repetitive lessons without counterexamples | Curriculum review and learner dry runs |
| False confidence from tests | Happy path passes but adaptation fails | Negative tests, debugging, change requests |
| Solution leakage | Starter includes answers or private fixtures | Allowlist publisher and leak scanner |
| Windows neglect | Scripts require Bash | Windows CI from Release 0 |
| Framework churn | Major upgrades mixed with curriculum work | Version pinning and migration policy |
| Incorrect security teaching | Auth works but trust boundaries fail | R4 security review and negative tests |
| Starter drift | Public starter edited manually | Generated-only policy |
| Lesson scope inflation | Multiple primary objectives | One-objective rule |
| Learner dead ends | Same undocumented help repeats | Blocker log and remediation |
| Tutorial-like capstones | Portfolios copy guided domains | Learner-selected domain and change request |
| Maintainer overload | Unused templates and tracks accumulate | Publish on demand |
| Accessibility added late | Keyboard flow fails near release | Gate criteria from first React milestone |
| Evidence inflation | Self-report labeled verified | Explicit trust levels |
| Copyright uncertainty | Source text copied into lessons | Original prose and source review |

## 27.2 Stop conditions

Pause expansion when:

- Schema is unstable while bulk content is being created
- Release 1 lacks an independent target-learner completion
- Publication can leak solutions
- Flaky tests are used as evidence
- Windows support exists only in documentation
- Critical security behavior lacks negative tests
- Artifacts cannot be reproduced from source commits
- The same undocumented intervention is repeatedly required
- A release has more placeholders than complete content
- Codex output exceeds review capacity

The response to a stop condition is to repair the kernel or contract, not abandon the project.

---

# 28. Explicitly deferred decisions

These decisions are intentionally scheduled rather than silently assumed.

## 28.1 Exact dependency versions

**Decision gate:** WP-00
**Rule:** Pin exact supported versions after a fresh compatibility and security check. Record them in lockfile, CI, and provenance. Do not use `latest` in committed setup instructions.

## 28.2 Core authentication mechanism

**Decision gate:** Architecture decision before WP-10 vertical-slice implementation
**Required outcome:** Select one primary authentication mechanism for core and teach it deeply. Do not teach multiple competing mechanisms in the same vertical slice. The ADR must cover browser storage boundaries, CSRF, CORS, expiry, logout, renewal, deployment topology, and negative tests.

**Default recommendation for review:** Server-managed sessions carried by secure `HttpOnly` cookies, because this makes browser and HTTP security boundaries explicit. Token-oriented authentication can be compared later.

## 28.3 Deployment providers

**Decision gate:** Release 1 deployment plan
**Rule:** The curriculum teaches provider-neutral concepts. A reference provider may be selected for reproducibility, but project contracts must describe the portable deployment boundary.

## 28.4 Licensing

**Decision gate:** Before the first public release
**Rule:** Code and educational content licensing must be explicit. A dual model may be evaluated, but no license is assumed by this specification.

## 28.5 Repository organization and public names

**Decision gate:** Before repository publication
**Rule:** Working name is `fullstack-javascript-roadmap`. GitHub organization, canonical domain, starter repository names, and package scope must be selected once and recorded before public package or template publication.

These decisions do not block writing the implementation plan, except where their gate is explicitly earlier than the affected work package.

---

# 29. Architecture spikes required before scaling

## Spike 1 — Curriculum to Starlight

Prove:

- Content outside `apps/docs` loads
- Extended frontmatter validates
- Body renders
- Stable semantic ID remains separate from file-derived route ID
- Navigation derives from curriculum metadata
- Draft content is excluded from production
- Development hot reload works

## Spike 2 — Curriculum graph

Prove valid graph, missing reference, self-cycle, two-node cycle, and multi-node cycle with complete path diagnostics.

## Spike 3 — Starter publication

Prove:

```text
Template source
→ Clean artifact
→ Fresh install
→ Test
→ Build
→ Independent operation
```

## Spike 4 — Cross-platform commands

Run the same public command contract on Windows and Linux.

## Spike 5 — Leak prevention

Detect intentional fixtures for solution paths, answer content, internal references, secrets, dotfiles, and symlink escape.

No bulk curriculum authoring begins until all five spikes meet their contracts.

---

# 30. Immediate execution order after written approval

```text
1. Create the greenfield repository
2. Commit this design specification
3. Add governance skeleton
4. Create issues for WP-00 through WP-10
5. Write the detailed implementation plan
6. Execute WP-00 in an isolated worktree
7. Verify root commands on Windows and Linux
8. Implement schemas and graph validation
9. Prove Starlight loading and assessment contracts
10. Prove template generation and leak prevention
11. Complete Release 0 exit verification
12. Begin Release 1 curriculum only after the kernel passes
```

No empty Release 2–6 directory scaffolding is required merely to make the repository look complete.

---

# 31. Final acceptance statement

The design is coherent only if the following invariants remain true:

```text
One curriculum source
One core stack
Mechanisms before framework convenience
Competencies before weeks
Verification before completion claims
Learner-owned project history
Generated and independently verified starters
Codex constrained by task contracts
Release expansion only after a complete path is proven
```

The product succeeds when a target learner can independently move from no web background to a deployed, explainable, tested fullstack application and produce versioned evidence suitable for beginning a junior job search.

---

# Appendix A. Example lesson metadata

```yaml
schemaVersion: 1

id: lesson-js-closure-private-state
slug: javascript/functions/closure-private-state

title: Closure và trạng thái riêng
description: Hiểu cách closure giữ lexical environment sau khi hàm ngoài kết thúc

status: published

module: module-js-functions
competencies:
  - js.scope.lexical
  - js.function.closure

prerequisites:
  - js.function.values
  - js.scope.block

exercises:
  - ex-js-closure-counter
  - ex-js-private-state

assessments:
  - check-js-closure-01

introducedIn: 0.2.0
lastReviewedIn: 0.2.0

sourceLanguage: vi
professionalArtifactLanguage: en
```

---

# Appendix B. Example focused exercise metadata

```yaml
schemaVersion: 1

id: ex-js-closure-counter
version: 1.0.0

title: Xây bộ đếm có trạng thái riêng
type: focused-exercise
language: javascript

competencies:
  - js.scope.lexical
  - js.function.closure
  - js.object.encapsulation

requiredLevel:
  js.scope.lexical: implement
  js.function.closure: implement

prerequisites:
  - js.function.values
  - js.scope.block

commands:
  install: pnpm install --frozen-lockfile
  test: pnpm test
  lint: pnpm lint
  verify: pnpm verify

constraints:
  forbiddenDependencies: []
  forbiddenApis:
    - globalThis
  editablePaths:
    - src/**

evidence:
  - test-report
  - source-diff
  - explanation
```

---

# Appendix C. Example evidence manifest

```yaml
schemaVersion: 1

curriculumVersion: 0.4.0
templateVersion: 0.4.0
milestoneId: milestone-fullstack-integration

contractVersions:
  exercise: 1
  rubric: 1
  evidence: 1

repository:
  url: https://github.com/example/project
  commit: 0123456789abcdef

deployment:
  frontend: https://example.dev
  api: https://api.example.dev

verification:
  ciRun: https://github.com/example/project/actions/runs/123
  status: passed

artifacts:
  architecture: evidence/architecture/overview.md
  authorizationMatrix: evidence/architecture/authorization-matrix.md
  debuggingReport: evidence/debugging/incident-001.md
```

---

# Appendix D. Example task contract

```markdown
# Objective

Add cycle detection to the curriculum prerequisite graph

# Context

The curriculum graph must remain a DAG before content can be published

# In scope

- Direct cycles
- Indirect cycles
- Complete cycle-path diagnostics
- Valid and invalid fixtures

# Out of scope

- Website visualization
- Automatic repair
- Stable-ID changes

# Allowed boundaries

- packages/curriculum-graph/**
- fixtures/curriculum-graph/**
- Related documentation

# Acceptance criteria

- Acyclic graph passes
- Self-cycle fails
- Two-node cycle fails
- Multi-node cycle fails
- Diagnostic includes every ID in the cycle
- Existing graph tests pass

# Commands

- pnpm --filter @roadmap/curriculum-graph test
- pnpm check
- pnpm verify

# Evidence

- Test summary
- Changed-file list
- Example diagnostic output
- Remaining limitations
```

---

# Appendix E. External technical references

These references support the technology feasibility decisions. They are not substitutes for version revalidation during WP-00.

- Node.js releases and LTS policy: https://nodejs.org/en/about/previous-releases
- Node.js July 2026 security-release notice: https://nodejs.org/en/blog/vulnerability/july-2026-security-releases
- Astro content collections and loaders: https://docs.astro.build/en/guides/content-collections/
- Starlight documentation: https://starlight.astro.build/
- pnpm workspaces: https://pnpm.io/workspaces
- pnpm workspace settings: https://pnpm.io/settings
- Vitest guide: https://vitest.dev/guide/
- Playwright browsers: https://playwright.dev/docs/browsers
- PostgreSQL documentation: https://www.postgresql.org/docs/current/
- Express documentation: https://expressjs.com/
- Drizzle documentation: https://orm.drizzle.team/docs/overview
- React documentation: https://react.dev/
- TypeScript documentation: https://www.typescriptlang.org/docs/
