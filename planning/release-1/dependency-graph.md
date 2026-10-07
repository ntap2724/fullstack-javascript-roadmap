# Release 1 dependency graph

`backlog.yaml` is the executable source of truth for Release 1 work items, dependencies, review requirements, and traceability. This document explains the intended flow without copying the mutable edge list.

```text
Governance → JavaScript laboratory → JavaScript content → TypeScript boundary
                                                    ├→ Web workflow
                                                    └→ API boundary → Database migration → Session / authorization
Web workflow + Atomic enrollment transaction → Fullstack duplicate-submission work → Assessment alignment → Learner pilot
```

The backlog validator enforces a deterministic topological order, complete competency traceability, content and assessment work for each module, and implementation/test/remediation work for every critical rubric criterion. A work item cannot claim `ready` while it has unresolved questions.

The pilot is an evidence gate, not permission to mark the technical preview as a completed curriculum or job-readiness path.
