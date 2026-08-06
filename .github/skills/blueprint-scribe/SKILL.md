---
name: blueprint-scribe
description: 'Synthesizes Code Cartographer artifacts.json (and, if available, a live Neo4j graph from Graph Forge) into docs/architecture.md — a Markdown document covering modules, REST API surface, layered type breakdown, class hierarchy and frameworks in play, with Mermaid diagrams. Use when asked to document the architecture, write a markdown overview of the code, or summarize "ideas about the code".'
argument-hint: 'None — reads .architect/artifacts.json, writes docs/architecture.md'
---

# Blueprint Scribe

Writes the human-readable deliverable: `docs/architecture.md`. Combines the static facts from [code-cartographer](../code-cartographer/SKILL.md) with live counts from the [graph-forge](../graph-forge/SKILL.md) Neo4j graph when reachable, and falls back gracefully to static-only analysis otherwise.

## When to Use
- The user asks for "a markdown doc about the code", "document the architecture", or "ideas about the codebase"
- As the final step of the full pipeline: Code Cartographer → Graph Forge → Blueprint Scribe

## What It Produces (`docs/architecture.md`)
- Module table (packaging, key Spring dependencies)
- Mermaid service map (module → config-server / discovery-service edges, inferred from dependency names)
- Heuristic type breakdown per module (Controller / Service / Repository / Entity / DTO / Configuration / Exception / Other)
- REST API surface table (method, path, handler, module)
- External frameworks/base types referenced (proxy for "what libraries this code leans on")
- Live Neo4j node/relationship counts, if `graph-forge/.env` is configured and reachable
- A short "Ideas & Observations" narrative section

## Procedure
1. Ensure `.architect/artifacts.json` exists (run Code Cartographer first).
2. Install dependencies: `cd .github/skills/blueprint-scribe && npm install`
3. Run: `npm run docs` (or `node scripts/generate-docs.js`)
4. Open [docs/architecture.md](../../../docs/architecture.md) and share a short summary with the user rather than pasting the whole file into chat.

See [generate-docs.js](./scripts/generate-docs.js) for implementation details.

## Notes
- Self-contained folder (own `package.json`) — can be moved independently
- Re-running overwrites `docs/architecture.md`; safe to re-run after any scan/graph update
- The "Ideas & Observations" section is a starting point — feel free to have the agent expand it with deeper analysis once the base document exists
