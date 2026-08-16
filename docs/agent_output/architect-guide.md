# Architect Agent — Getting Started Guide

This repo includes a custom Copilot agent, **Architect**, that documents the codebase automatically: it parses the Java source, builds a knowledge graph in Neo4j, and writes [docs/agent_output/01-architecture/architecture.md](./architecture.md). This guide is for teammates who want to run it locally.

## How things are named

Every agent, skill and output folder carries its **execution-order number** as a prefix, so all three
listings read in the same order the pipeline actually runs:

- **Agents** — `.github/agents/NN_<name>.agent.md`, numbered `01`–`12` in run order.
- **Skills** — `.github/skills/NN-<name>/`, numbered to match **the agent that runs them**. Where one
  agent runs several skills in sequence, a letter suffix keeps them ordered (`01a` → `01d`).
- **Outputs** — `docs/agent_output/NN-<name>/`, numbered to match the agent that writes them.
- Numbers are zero-padded so `10`–`12` sort after `02`, not before it.

The whole harness lives under `.github/`: the agents, the skills, the generated documents
(`docs/agent_output/`) and the regeneratable working data (`docs/agent_output/.architect/`, gitignored).

**Step 00 is the input.** `docs/agent_output/00-issues/issue-register.xlsx` is an Excel workbook with one
row per reported vulnerability. It is written by whoever reports the issue and is read-only to every
agent. See [`docs/agent_output/00-issues/README.md`](./00-issues/README.md) for the column contract.

## What's included

| Step | Agent (`.github/agents/`) | Skill (`.github/skills/`) | Produces |
|---|---|---|---|
| **00** | _(none — human input)_ | `00-issue-register/` | Reads `docs/agent_output/00-issues/issue-register.xlsx`; serves every issue-consuming skill |
| **01** | `01_architect.agent.md` | `01a-code-cartographer/` | `docs/agent_output/.architect/artifacts.json` — parses every `pom.xml` + `.java` file |
| | ″ | `01b-context-weaver/` | `docs/agent_output/.architect/context/descriptions.json` — the semantic layer over those artifacts |
| | ″ | `01c-graph-forge/` | The Neo4j knowledge graph — artifacts + context on the same nodes |
| | ″ | `01d-blueprint-scribe/` | `docs/agent_output/01-architecture/architecture.md` + `docs/agent_output/01-architecture/function-reference.md` |
| **02** | `02_root-cause-analyst.agent.md` | `02-root-cause-analyst/` | `docs/agent_output/02-root-cause/root_cause_<issue_id>.md` — *why* the defect exists |
| **03** | `03_blast-radius-analyst.agent.md` | `03-blast-radius-analyst/` | `docs/agent_output/03-blast-radius/blast_radius_<issue_id>.md` — how far it reaches |
| **04** | `04_fix-strategist.agent.md` | `04-fix-strategist/` | `docs/agent_output/04-fix-plans/fix_plan_<issue_id>.md` (Status: Proposed) — a strategy, never a diff |
| **05** | `05_fixer.agent.md` | `05-fixer/` | `docs/agent_output/05-fixes/fix_<issue_id>.md` + `fix_<issue_id>.diff` — only from an **Approved** plan |
| **06** | `06_re-scanner.agent.md` | `06-verification-layer/` *(shared by 06–08)* | `docs/agent_output/06-verify/rescan_<issue_id>.md` — does the finding still trigger? |
| **07** | `07_red-team-recon.agent.md` | ″ | `docs/agent_output/06-verify/redteam_<issue_id>.md` — can the patch be bypassed? |
| **08** | `08_behavior-guard.agent.md` | ″ | `docs/agent_output/06-verify/behavior_<issue_id>.md` — did unrelated behavior change? |
| **09** | `09_qa-runner.agent.md` | `09-qa-runner/` | `docs/agent_output/09-qa/qa_<issue_id>.md` — Status is script-decided, never agent-judged |
| **10** | `10_build-gatekeeper.agent.md` | `10-build-gatekeeper/` | `docs/agent_output/10-build/build_<issue_id>.md` — 100% script-generated, no agent judgment |
| **11** | `11_merge-arbiter.agent.md` | `11-merge-arbiter/` | `docs/agent_output/11-ship/verdict_<issue_id>.md` — the only Cleared/Blocked call in the system |
| **12** | `12_scribe.agent.md` | `12-scribe/` | `docs/agent_output/11-ship/pr_<issue_id>.md` + `docs/agent_output/11-ship/audit_<issue_id>.md` — always written |

Steps **06–08 run in parallel** — the numbering is pipeline position, not a dependency between them.
Same for **09–10**. Everything else is strictly sequential.

Each skill folder is self-contained (its own `package.json`) so it can be copied or moved
independently — except `06-verification-layer`, which is deliberately shared by its three agents
because they read identical inputs; see [Phase C](#phase-c--verify-and-ship) below.

## Phase A — Diagnosing an issue, then sizing it

Once the architecture docs and the graph exist (step **01**, the Architect), two further agents run
on top of them, in order:

**02 — Root Cause Analyst** — reads every row in the issue register
   [`issue-register.xlsx`](./00-issues/issue-register.xlsx) and writes one
   `root_cause_<issue_id>.md` to [`docs/agent_output/02-root-cause/`](./02-root-cause/), explaining *why* each
   defect exists. Add issues by appending a row in Excel (columns in
   [`docs/agent_output/00-issues/README.md`](./00-issues/README.md)); the agent never authors them.
   See [`.github/skills/02-root-cause-analyst/SKILL.md`](../../.github/skills/02-root-cause-analyst/SKILL.md).
**03 — Blast Radius Analyst** — reads every root cause report and writes one
   `blast_radius_<issue_id>.md` to [`docs/agent_output/03-blast-radius/`](./blast-radius/), showing *how far* each
   defect reaches: which services and endpoints break, which degrade, and who feels it, with
   diagrams aimed at a non-engineer.
   See [`.github/skills/03-blast-radius-analyst/SKILL.md`](../../.github/skills/03-blast-radius-analyst/SKILL.md).

Phase A only diagnoses and scopes. Nothing in it writes code, and the Root Cause Analyst explicitly
refuses to patch source.

## Phase B — Remediation

Two more agents turn a diagnosed defect into a verified, human-approved diff:

**04 — Fix Strategist** — reads every root cause report (and its blast radius report, if one exists)
   and matches the defect against a curated, auditable CWE → remediation-pattern catalog at
   [`.github/skills/04-fix-strategist/catalog/cwe-patterns.json`](../../.github/skills/04-fix-strategist/catalog/cwe-patterns.json),
   writing one `fix_plan_<issue_id>.md` to [`docs/agent_output/04-fix-plans/`](./fix-plans/). It never writes a diff —
   only a strategy. Every plan starts at **Status: Proposed**.
   See [`.github/skills/04-fix-strategist/SKILL.md`](../../.github/skills/04-fix-strategist/SKILL.md).
**⏸ Human checkpoint** — a person approves the plan by hand-editing its Status cell from `Proposed`
   to `Approved` (or to `Rejected` to close it without a fix) directly in the rendered file. No code
   gets written before this step.

**05 — Fixer** — acts only on plans at **Status: Approved**. It drafts the smallest diff implementing
   the plan in the app's existing style, compiles the diff by applying and building it inside a
   throwaway `git worktree` (created from `HEAD`, always destroyed afterward — the real working tree
   is never touched), and writes one `fix_<issue_id>.md` report plus a standalone, directly
   `git apply`-able `fix_<issue_id>.diff` to [`docs/agent_output/05-fixes/`](./fixes/).
   See [`.github/skills/05-fixer/SKILL.md`](../../.github/skills/05-fixer/SKILL.md).

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

- **06 — re-scanner** — does the originally reported finding still trigger?
- **07 — red-team-recon** — can the patch be bypassed by a different vector?
- **08 — behavior-guard** — did anything change outside what the fix plan intended?

All three share one skill, [`06-verification-layer`](../../.github/skills/06-verification-layer/SKILL.md),
and write `docs/agent_output/06-verify/{rescan,redteam,behavior}_<issue_id>.md`.

### Step 2 — Test & build gate (deterministic, no open-ended agentic reasoning)

- **09 — qa-runner** — drafts exactly one new regression test (mocked, since there's no live database
  here to back a `@DataMongoTest`), then a **script** applies it and runs it for real in an isolated
  worktree. The agent never sees or overrides that exit code.
  See [`.github/skills/09-qa-runner/SKILL.md`](../../.github/skills/09-qa-runner/SKILL.md).
- **10 — build-gatekeeper** — runs `mvn verify` plus a before/after `dependency:tree` diff, entirely
  script-generated — the only report in this whole system with no agent-authored content at all.
  See [`.github/skills/10-build-gatekeeper/SKILL.md`](../../.github/skills/10-build-gatekeeper/SKILL.md).

Writes `docs/agent_output/09-qa/qa_<issue_id>.md` and `docs/agent_output/10-build/build_<issue_id>.md`.

### Step 3 — Judge and merge

- **11 — merge-arbiter** — the only agent allowed to declare a patch safe to ship. A deterministic script
  scores the five upstream reports against externalized weights and two hard gates (re-scanner
  `STILL_VULNERABLE`, build gate `Failed` — no score rescues either) in
  [`scoring.json`](../../.github/skills/11-merge-arbiter/scoring.json), scaled by the issue's severity. The
  agent may explicitly contest that outcome, but never silently — the computed decision and any
  override are always shown side by side. Writes `docs/agent_output/11-ship/verdict_<issue_id>.md`.
- **12 — scribe** — writes the PR content and the audit trail *unconditionally*, Cleared or Blocked. A
  Blocked patch still gets a PR draft, banner-marked "do not open." **Never runs `git` or `gh`** —
  writes `docs/agent_output/11-ship/pr_<issue_id>.md` + `docs/agent_output/11-ship/audit_<issue_id>.md` for a human to act on.

The full chain, end to end. Every `NN-*/` folder below lives under `docs/agent_output/`:

```
                    ┌──────────────────── 01_architect ────────────────────┐
   source  ───────► 01a-code-cartographer ─► 01b-context-weaver ─►         │
                    │       01c-graph-forge ─► 01d-blueprint-scribe        │
                    └───────────────────────────┬─────────────────────────-┘
                                                ▼
                                        01-architecture/  (architecture.md
                                                           function-reference.md)
                                                │
 00-issues/issue-register.xlsx ──► 02_root-cause-analyst ◄┤
        (human input, Excel)                    │        │
                                                ▼        │
                              02-root-cause/ ─► 03_blast-radius-analyst ◄┘
                                       │                 ▼
                                       │          03-blast-radius/
                                       │                 │
                                       └──► 04_fix-strategist ◄┘
                                                ▼
                                       04-fix-plans/   (Status: Proposed)
                                                │
                                  ⏸  human sets Status: Approved  ⏸
                                                ▼
                                            05_fixer
                                                ▼
                                       05-fixes/   (Compiled | Compile Failed)
                                                │
                    ┌───────────────────┬───────┴───────────┐   06-08 — parallel
                    ▼                   ▼                   ▼
             06_re-scanner     07_red-team-recon    08_behavior-guard
                    │                   │                   │
                    └───────────────────┴─────────┬─────────┘
                                                  ▼
                            06-verify/{rescan,redteam,behavior}_<id>.md
                                                  │
                    ┌─────────────────────────────┴─────────┐   09-10 — deterministic
                    ▼                                       ▼
             09_qa-runner                          10_build-gatekeeper
                    │                                       │
             09-qa/qa_<id>.md                      10-build/build_<id>.md
                    └───────────────────┬───────────────────┘
                                        ▼
                                11_merge-arbiter                  11-12 — score & ship
                                        ▼
                          11-ship/verdict_<id>.md   (Cleared | Blocked)
                                        ▼
                                    12_scribe
                                        ▼
                    11-ship/pr_<id>.md + 11-ship/audit_<id>.md   (always written)
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
   cd .github/skills/01a-code-cartographer; npm install
   cd ../01b-context-weaver; npm install
   cd ../01c-graph-forge; npm install
   cd ../01d-blueprint-scribe; npm install
   ```
2. If you're using Graph Forge, configure your Neo4j connection:
   ```powershell
   cd .github/skills/01c-graph-forge
   Copy-Item .env.example .env
   ```
   Then edit `.env` and fill in your own `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`.
   **Never commit this `.env` file or paste your password into chat** — it's already covered by `.gitignore`, and each teammate should use their own Neo4j instance/credentials.

## Running it

### Option A — ask the agent
Open Copilot Chat, pick the **`01_architect`** agent (or just ask "run the 01_architect agent" / "document the architecture"), and it will run the pipeline and summarize the results for you.

### Option B — run the scripts directly
```powershell
cd .github/skills/01a-code-cartographer; node scripts/scan.js
cd ../01c-graph-forge; node scripts/build-graph.js   # optional, needs .env
cd ../01d-blueprint-scribe; node scripts/generate-docs.js
```

## Where the output goes

- `docs/agent_output/.architect/artifacts.json` — intermediate scan data, gitignored (local cache, regenerate anytime with the scan script)
- `docs/agent_output/01-architecture/architecture.md` — the shareable Markdown document, **not** gitignored — commit it when you want to update the team's view of the architecture
- The Neo4j graph itself — browse/query it directly in your Neo4j instance (aura console or `neo4j://localhost:7474` for local Docker) using Cypher, e.g.:
  ```cypher
  MATCH (m:Module)-[:CONTAINS]->(t:Type) RETURN m.name, count(t);
  ```
- `docs/agent_output/02-root-cause/`, `docs/agent_output/03-blast-radius/`, `docs/agent_output/04-fix-plans/`, `docs/agent_output/05-fixes/`, `docs/agent_output/06-verify/`,
  `docs/agent_output/09-qa/`, `docs/agent_output/10-build/` and `docs/agent_output/11-ship/` — all committed, all produced the same way: a script
  gathers facts into `docs/agent_output/.architect/<sub>/` (gitignored), the agent writes a small piece of
  schema-validated judgement alongside it (or, for `10_build-gatekeeper`, nothing at all — that report
  is 100% script-generated), and a render script merges the two into the final Markdown. None of
  these generated reports carry YAML front matter — downstream tooling reads them by filename pattern
  and by regex against an "At a glance" table, including the **Status**/**Decision** cells that gate
  the Fixer and merge-arbiter agents (see [Phase B](#phase-b--remediation) and
  [Phase C](#phase-c--verify-and-ship) above).

## Re-running after code changes

Re-run the scan (step 1) any time source changes, then re-run graph-forge and/or blueprint-scribe as needed. All three scripts use `MERGE`/overwrite semantics, so re-running is safe and won't create duplicates.
