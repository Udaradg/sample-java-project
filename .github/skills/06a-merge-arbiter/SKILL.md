---
name: 06a-merge-arbiter
description: 'Deterministically scores the five Phase C upstream reports (acceptance-check, edge-case review, behavior, QA, build) against externalized weights and hard gates in scoring.json, then writes docs/agent_output/06-ship/verdict_<id>.md — Cleared or Blocked. Only place in the whole pipeline where a change is declared safe to ship. Use when asked whether a change is ready to merge, to score a story''s readiness, or to make the final ship/no-ship call.'
argument-hint: 'Nothing (processes every change with all five upstream reports ready), or a specific story id such as JIRA-001'
---

# Merge Arbiter

Phase C step 3, first half — the only place in this pipeline authorized to declare a change safe
to ship. Scores five upstream reports against externalized weights and hard gates in
[`scoring.json`](./scoring.json), fully deterministically.

**`docs/agent_output/03-development/`, `docs/agent_output/04-verify/` and
`docs/agent_output/05-test-gate/` are read-only input.** Nothing here writes to them.

## How scoring works

`compute-score.js` is fully deterministic: two hard gates (acceptance-check `NOT_SATISFIED`, build
gate `Failed`) block regardless of score; otherwise a weighted 0-100 score from edge-case review
(30), behavior (30) and QA (40) is compared against a priority-scaled threshold from `scoring.json`
(keyed by the story's `Priority` field: `Critical`/`High`/`Medium`/`Low`).

## The agent's role: narrative, and a narrow, never-silent override

Write `.github/.pipeline-context/merge/<id>.arbitration.json`: a plain-language `narrative` a
reviewer can read without opening all five upstream reports, and an `override` object defaulting to
`applied: false`. An override may only make a computed `Cleared` decision more conservative by
changing it to `Blocked`, evidence-cited — never the reverse, and never to clear a failed hard gate.

## Files

| Path | Purpose |
|---|---|
| `scripts/lib/arbiter.js` | Path resolution, upstream report parsing, story priority lookup |
| `scripts/compute-score.js` | Deterministic score/gate computation |
| `scripts/render-verdict.js` | Merges the score with the agent's arbitration into the verdict |
| `scripts/list-merge-workload.js` | CLI: every change and what it's still waiting on |
| `scoring.json` | Editable weights, hard gates, and priority-scaled thresholds |
| `templates/arbitration.schema.json` | Schema for the agent-authored narrative |

Zero dependencies, no `npm install`.

## Procedure

```powershell
cd .github/skills/06a-merge-arbiter
node scripts/list-merge-workload.js
node scripts/compute-score.js --story JIRA-001      # or --all
# ... read <id>.score.json, write <id>.arbitration.json ...
node scripts/render-verdict.js --all
```

## Constraints

- DO NOT recompute the score yourself or state a number that disagrees with
  `.github/.pipeline-context/merge/<id>.score.json` — that file is the fact; your narrative explains it.
- DO NOT set `override.applied: true` unless the computed decision is `Cleared`, the override is
  `Blocked`, and the reason cites specific upstream evidence.
- DO NOT create, edit, rename or delete anything in `docs/agent_output/03-development/`,
  `docs/agent_output/04-verify/` or `docs/agent_output/05-test-gate/`.
- No `npm install` is needed.
