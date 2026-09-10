# Context Weaver — Authoring Brief

_Generated 2026-09-10T11:00:06.610Z from a scan taken 2026-09-10T11:00:06.470Z._

**0 node(s) need a description** — .
Reusable from the previous run: 39. Selection thresholds: type ≥ 3, method ≥ 3.

## How to use this brief

Write one entry per node below into `.github/.pipeline-context/context/descriptions.json`, validating against
[descriptions.schema.json](../../../.github/skills/01b-context-weaver/templates/descriptions.schema.json).
Copy each node's `kind`, `id` and `fingerprint` verbatim — they are how the description binds to the graph.

Write for the agent that reads this next, not for a human browsing docs:

- **summary** — what this is and what it is for, in the domain's words. `"Owns the employee roster and is the only writer of the employees collection"`, not `"a service class"`.
- **failureModes / invariants** — what breaks if this is wrong, and what must stay true. This is what a Root Cause agent needs and cannot derive from an AST.
- **sideEffects** — writes, outbound calls, mutated state. This is what a Blast Radius agent needs.
- **testHints** — how to exercise it. This is what a QA agent needs.
- **criticality** — how much damage a defect here does, not how complex the code is.

Ground every claim in the evidence below or in the source file. If you cannot tell what something is for,
say so with `"confidence": "low"` — a hedged description is useful, an invented one is not. Skip a node
entirely rather than pad it; a missing description is a smaller problem than a wrong one.

## Nodes

## Cross-cutting notes

Some facts belong to no single node — a shared datastore, a service-to-service dependency that
carries no Java call edge, a deployment ordering constraint. Record those in the `crossCutting`
array, scoped to the modules and types they concern.
