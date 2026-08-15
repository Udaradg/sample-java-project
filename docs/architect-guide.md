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
| `.github/agents/fix-strategist.agent.md` | A fourth agent that picks a CWE-aligned remediation strategy for a diagnosed defect |
| `.github/skills/fix-strategist/` | Matches a defect against a CWE pattern catalog and writes `docs/fix-plans/fix_plan_<issue_id>.md` (Status: Proposed) |
| `.github/agents/fixer.agent.md` | A fifth agent that turns an **Approved** fix plan into a compiled diff |
| `.github/skills/fixer/` | Drafts, isolation-compiles and writes `docs/fixes/fix_<issue_id>.md` + `fix_<issue_id>.diff` |
| `.github/agents/re-scanner.agent.md`, `red-team-recon.agent.md`, `behavior-guard.agent.md` | Three parallel agents that re-verify a **Compiled** fix — still triggers? bypassable? behavior changed? |
| `.github/skills/verification-layer/` | Shared skill behind all three — static/reasoning-based, no live database — writes `docs/verify/{rescan,redteam,behavior}_<issue_id>.md` |
| `.github/agents/qa-runner.agent.md` | Drafts one mocked regression test, then a deterministic script runs it in an isolated worktree |
| `.github/skills/qa-runner/` | Writes `docs/qa/qa_<issue_id>.md` — Status is script-decided, never agent-judged |
| `.github/agents/build-gatekeeper.agent.md` | Runs `mvn verify` + a dependency-tree diff — the one agent whose report is 100% script-generated |
| `.github/skills/build-gatekeeper/` | Writes `docs/build/build_<issue_id>.md` |
| `.github/agents/merge-arbiter.agent.md` | The only agent allowed to declare a patch safe to ship — deterministic weighted score + hard gates |
| `.github/skills/merge-arbiter/` | Scores against `scoring.json` and writes `docs/ship/verdict_<issue_id>.md` |
| `.github/agents/scribe.agent.md` | Writes the PR content and audit trail — always, Cleared or Blocked, never touches git/GitHub |
| `.github/skills/scribe/` | Writes `docs/ship/pr_<issue_id>.md` + `docs/ship/audit_<issue_id>.md` |

Each skill folder is self-contained (its own `package.json`) so it can be copied or moved
independently — except `verification-layer`, which is deliberately shared by its three agents
because they read identical inputs; see [Phase C](#phase-c--verify-and-ship) below.

## Phase A — Diagnosing an issue, then sizing it

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

Phase A only diagnoses and scopes. Nothing in it writes code, and the Root Cause Analyst explicitly
refuses to patch source.

## Phase B — Remediation

Two more agents turn a diagnosed defect into a verified, human-approved diff:

3. **Fix Strategist** — reads every root cause report (and its blast radius report, if one exists)
   and matches the defect against a curated, auditable CWE → remediation-pattern catalog at
   [`.github/skills/fix-strategist/catalog/cwe-patterns.json`](../.github/skills/fix-strategist/catalog/cwe-patterns.json),
   writing one `fix_plan_<issue_id>.md` to [`docs/fix-plans/`](./fix-plans/). It never writes a diff —
   only a strategy. Every plan starts at **Status: Proposed**.
   See [`.github/skills/fix-strategist/SKILL.md`](../.github/skills/fix-strategist/SKILL.md).
4. **A human approves the plan** by hand-editing its Status cell from `Proposed` to `Approved` (or to
   `Rejected` to close it without a fix) directly in the rendered file. This is the checkpoint: no
   code gets written before this step.
5. **Fixer** — acts only on plans at **Status: Approved**. It drafts the smallest diff implementing
   the plan in the app's existing style, compiles the diff by applying and building it inside a
   throwaway `git worktree` (created from `HEAD`, always destroyed afterward — the real working tree
   is never touched), and writes one `fix_<issue_id>.md` report plus a standalone, directly
   `git apply`-able `fix_<issue_id>.diff` to [`docs/fixes/`](./fixes/).
   See [`.github/skills/fixer/SKILL.md`](../.github/skills/fixer/SKILL.md).

**A `Compiled` result is not a merge signal.** It only means the module builds. Whether the patch
actually closes the vulnerability, survives adversarial re-testing, passes a real test/build gate,
and is safe to ship is decided entirely by [Phase C](#phase-c--verify-and-ship).

## Phase C — Verify and Ship

Seven more agents, in three steps, catch a fix that *looks* closed but isn't, gate it on a real
build/test, and score a final ship decision. Nothing in Phase C touches the real working tree or
git/GitHub state — same discipline as Fixer.

### Step 1 — Multi-layer verification (parallel, static/reasoning-based)

This repository has no embedded-MongoDB/Testcontainers dependency, so none of these three replay the
exploit against a live service — instead they materialize the *patched* file by applying the fix's
diff inside a throwaway worktree and reason over that, never a running instance:

- **re-scanner** — does the originally reported finding still trigger?
- **red-team-recon** — can the patch be bypassed by a different vector?
- **behavior-guard** — did anything change outside what the fix plan intended?

All three share one skill, [`verification-layer`](../.github/skills/verification-layer/SKILL.md),
and write `docs/verify/{rescan,redteam,behavior}_<issue_id>.md`.

### Step 2 — Test & build gate (deterministic, no open-ended agentic reasoning)

- **qa-runner** — drafts exactly one new regression test (mocked, since there's no live database
  here to back a `@DataMongoTest`), then a **script** applies it and runs it for real in an isolated
  worktree. The agent never sees or overrides that exit code.
  See [`.github/skills/qa-runner/SKILL.md`](../.github/skills/qa-runner/SKILL.md).
- **build-gatekeeper** — runs `mvn verify` plus a before/after `dependency:tree` diff, entirely
  script-generated — the only report in this whole system with no agent-authored content at all.
  See [`.github/skills/build-gatekeeper/SKILL.md`](../.github/skills/build-gatekeeper/SKILL.md).

Writes `docs/qa/qa_<issue_id>.md` and `docs/build/build_<issue_id>.md`.

### Step 3 — Judge and merge

- **merge-arbiter** — the only agent allowed to declare a patch safe to ship. A deterministic script
  scores the five upstream reports against externalized weights and two hard gates (re-scanner
  `STILL_VULNERABLE`, build gate `Failed` — no score rescues either) in
  [`scoring.json`](../.github/skills/merge-arbiter/scoring.json), scaled by the issue's severity. The
  agent may explicitly contest that outcome, but never silently — the computed decision and any
  override are always shown side by side. Writes `docs/ship/verdict_<issue_id>.md`.
- **scribe** — writes the PR content and the audit trail *unconditionally*, Cleared or Blocked. A
  Blocked patch still gets a PR draft, banner-marked "do not open." **Never runs `git` or `gh`** —
  writes `docs/ship/pr_<issue_id>.md` + `docs/ship/audit_<issue_id>.md` for a human to act on.

The full chain, end to end:

```
source  →  code-cartographer  →  graph-forge  →  blueprint-scribe  →  docs/architecture.md
                                                                      docs/function-reference.md
                                                                              │
docs/issues/  ─────────────────→  root-cause-analyst  ────────────────────────┤
                                          │                                   │
                                          ↓                                   │
                                  docs/root-cause/  →  blast-radius-analyst  ←┘
                                          │                    ↓
                                          │            docs/blast-radius/
                                          │                    │
                                          └──────→  fix-strategist  ←────────┘
                                                          ↓
                                                  docs/fix-plans/  (Status: Proposed)
                                                          │
                                            ⏸  human sets Status: Approved  ⏸
                                                          ↓
                                                        fixer
                                                          ↓
                                              docs/fixes/  (Status: Compiled | Compile Failed)
                                                          │
                          ┌───────────────────┬──────────┴──────────┐    Step 1 — parallel
                          ▼                   ▼                     ▼
                    re-scanner          red-team-recon        behavior-guard
                          │                   │                     │
                          └───────────────────┴──────────┬──────────┘
                                                          ▼
                          docs/verify/{rescan,redteam,behavior}_<id>.md
                                                          │
                          ┌───────────────────────────────┴──────────┐    Step 2 — deterministic
                          ▼                                          ▼
                     qa-runner                              build-gatekeeper
                          │                                          │
                   docs/qa/qa_<id>.md                     docs/build/build_<id>.md
                          └───────────────────┬───────────────────────┘
                                               ▼
                                        merge-arbiter                    Step 3 — score & ship
                                               ↓
                                  docs/ship/verdict_<id>.md  (Cleared | Blocked)
                                               ↓
                                            scribe
                                               ↓
                          docs/ship/pr_<id>.md + docs/ship/audit_<id>.md  (always written)
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
- `docs/root-cause/`, `docs/blast-radius/`, `docs/fix-plans/`, `docs/fixes/`, `docs/verify/`,
  `docs/qa/`, `docs/build/` and `docs/ship/` — all committed, all produced the same way: a script
  gathers facts into `.architect/<sub>/` (gitignored), the agent writes a small piece of
  schema-validated judgement alongside it (or, for `build-gatekeeper`, nothing at all — that report
  is 100% script-generated), and a render script merges the two into the final Markdown. None of
  these generated reports carry YAML front matter — downstream tooling reads them by filename pattern
  and by regex against an "At a glance" table, including the **Status**/**Decision** cells that gate
  the Fixer and merge-arbiter agents (see [Phase B](#phase-b--remediation) and
  [Phase C](#phase-c--verify-and-ship) above).

## Re-running after code changes

Re-run the scan (step 1) any time source changes, then re-run graph-forge and/or blueprint-scribe as needed. All three scripts use `MERGE`/overwrite semantics, so re-running is safe and won't create duplicates.
