# Architect Agent — Getting Started Guide

This repo includes a custom Copilot agent, **Architect**, that documents the codebase automatically: it parses the Java source, builds a knowledge graph in Neo4j, and writes [docs/architecture.md](./architecture.md). This guide is for teammates who want to run it locally.

## What's included

| Location | Purpose |
|---|---|
| `.github/agents/architect.agent.md` | The agent persona (pick it from the agent selector in Copilot Chat, or say "run the architect agent") |
| `.github/skills/code-cartographer/` | Parses every `pom.xml` + `.java` file into `.architect/artifacts.json` |
| `.github/skills/graph-forge/` | Loads those artifacts into a Neo4j graph database |
| `.github/skills/blueprint-scribe/` | Writes `docs/architecture.md` from the artifacts (+ live Neo4j stats if available) |
| `.github/agents/root-cause-analyst.agent.md` | A second agent that consumes the outputs above to diagnose a reported issue |
| `.github/skills/root-cause-analyst/` | Gathers evidence for one issue and writes `docs/root-cause/root_cause_<issue_id>.md` |
| `.github/agents/blast-radius-analyst.agent.md` | A third agent that measures how far each diagnosed defect reaches |
| `.github/skills/blast-radius-analyst/` | Measures reach and writes `docs/blast-radius/blast_radius_<issue_id>.md` |

Each skill folder is self-contained (its own `package.json`) so it can be copied or moved independently.

## Diagnosing an issue, then sizing it

Once the architecture docs and the graph exist, two further agents run on top of them, in order:

1. **Root Cause Analyst** — reads every issue in [`docs/issues/`](./issues/) and writes one
   `root_cause_<issue_id>.md` to [`docs/root-cause/`](./root-cause/), explaining *why* each defect
   exists. Add issues to `docs/issues/` yourself (format in
   [`docs/issues/README.md`](./issues/README.md)); the agent never authors them.
   See [`.github/skills/root-cause-analyst/SKILL.md`](../.github/skills/root-cause-analyst/SKILL.md).
2. **Blast Radius Analyst** — reads every root cause report and writes one
   `blast_radius_<issue_id>.md` to [`docs/blast-radius/`](./blast-radius/), showing *how far* each
   defect reaches: which services and endpoints break, which degrade, and who feels it, with
   diagrams aimed at a non-engineer.
   See [`.github/skills/blast-radius-analyst/SKILL.md`](../.github/skills/blast-radius-analyst/SKILL.md).

The full chain, end to end:

```
source  →  code-cartographer  →  graph-forge  →  blueprint-scribe  →  docs/architecture.md
                                                                      docs/function-reference.md
                                                                              │
docs/issues/  ─────────────────→  root-cause-analyst  ────────────────────────┤
                                          │                                   │
                                          ↓                                   │
                                  docs/root-cause/  →  blast-radius-analyst  ←┘
                                                              ↓
                                                      docs/blast-radius/
```

## Prerequisites

- **Node.js** 18+ (`node -v` to check)
- **npm** — on Windows PowerShell, use `npm.cmd install` if plain `npm install` is blocked by execution policy
- **A Neo4j instance** — only required for the Graph Forge step. Options:
  - A free [Neo4j aura](https://neo4j.com/cloud/aura/) instance (recommended — no local install)
  - A local instance via Docker: `docker run -d -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=neo4j/<password> neo4j:5`
  - Skip this step entirely — Code Cartographer and Blueprint Scribe work without Neo4j (the doc just omits the "Live Graph Snapshot" section)

## One-time setup

1. Install dependencies for each skill you plan to run:
   ```powershell
   cd .github/skills/code-cartographer; npm install
   cd ../graph-forge; npm install
   cd ../blueprint-scribe; npm install
   ```
2. If you're using Graph Forge, configure your Neo4j connection:
   ```powershell
   cd .github/skills/graph-forge
   Copy-Item .env.example .env
   ```
   Then edit `.env` and fill in your own `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`.
   **Never commit this `.env` file or paste your password into chat** — it's already covered by `.gitignore`, and each teammate should use their own Neo4j instance/credentials.

## Running it

### Option A — ask the agent
Open Copilot Chat, pick the **architect** agent (or just ask "run the architect agent" / "document the architecture"), and it will run the pipeline and summarize the results for you.

### Option B — run the scripts directly
```powershell
cd .github/skills/code-cartographer; node scripts/scan.js
cd ../graph-forge; node scripts/build-graph.js   # optional, needs .env
cd ../blueprint-scribe; node scripts/generate-docs.js
```

## Where the output goes

- `.architect/artifacts.json` — intermediate scan data, gitignored (local cache, regenerate anytime with the scan script)
- `docs/architecture.md` — the shareable Markdown document, **not** gitignored — commit it when you want to update the team's view of the architecture
- The Neo4j graph itself — browse/query it directly in your Neo4j instance (aura console or `neo4j://localhost:7474` for local Docker) using Cypher, e.g.:
  ```cypher
  MATCH (m:Module)-[:CONTAINS]->(t:Type) RETURN m.name, count(t);
  ```

## Re-running after code changes

Re-run the scan (step 1) any time source changes, then re-run graph-forge and/or blueprint-scribe as needed. All three scripts use `MERGE`/overwrite semantics, so re-running is safe and won't create duplicates.
