---
name: merge-arbiter
description: 'Deterministically scores the five Phase C upstream reports (re-scan, red-team, behavior, QA, build) against externalized weights and hard gates in scoring.json, then writes docs/ship/verdict_<id>.md — Cleared or Blocked. Only place in the whole pipeline where a patch is declared safe to ship. Use when asked whether a patch is ready to merge, to score a fix''s readiness, or to make the final ship/no-ship call.'
argument-hint: 'Nothing (processes every fix with all five upstream reports ready), or a specific issue id such as ISSUE-001'
---

# Merge Arbiter

Phase C step 3, first half. Aggregates re-scanner, red-team-recon, behavior-guard, qa-runner and
build-gatekeeper into one scored decision. **This is the only agent in the entire pipeline allowed
to say a patch is safe to ship.** Nothing upstream — not Fixer's `Compiled`, not any individual Step
1/2 check — is a merge signal on its own.

**`docs/fixes/`, `docs/verify/`, `docs/qa/`, `docs/build/` and `docs/issues/` are all read-only
input.** Nothing here writes to any of them.

## How scoring works

`scoring.json` (externalized and auditable, same pattern as `fix-strategist`'s CWE catalog — edit
weights there, never in the scripts):

- **Two hard gates, no score can override them:** re-scanner `STILL_VULNERABLE` blocks; build gate
  `Failed` blocks. `compute-score.js` decides this mechanically.
- **Weighted score (0-100) otherwise:** red-team (30 pts), behavior-guard (30 pts), QA (40 pts), each
  mapped from its verdict. A confirmed bypass (`BYPASS_FOUND` = 0/30) isn't a separate hard gate, but
  it caps the maximum possible score at 70 — below every configured threshold — so it blocks in
  practice through the math, not a special case.
- **Threshold scales with severity**, read from the linked issue (`severity_thresholds` in
  `scoring.json`; falls back to `default_threshold`).

## The agent's role: narrative, and a narrow, never-silent override

`compute-score.js` computes the score and the decision — you do not recompute or restate it
differently. You read `.architect/merge/<id>.score.json` and write
`.architect/merge/<id>.arbitration.json`: a plain-language `narrative` explaining the decision, and
an `override` object that defaults to `applied: false`. You may set `applied: true` with a `decision`
and an evidenced `reason` to contest the computed outcome in **either** direction — but
`render-verdict.js` always shows the computed decision **and** your override side by side. There is
no path in this system for an override to be invisible.

## Output

`docs/ship/verdict_<id>.md` — Decision (`Cleared`/`Blocked`), score breakdown, hard-gate table, links
to all five upstream reports, the narrative, and the override section if one was applied.
`docs/ship/README.md`'s index is owned by the **scribe** skill, not this one — it is written once
scribe runs, since scribe's own workload already covers every rendered verdict.

Intermediate: `.architect/merge/<id>.score.json` (script), `<id>.arbitration.json` (agent).

## Procedure

### Step 1 — Discover the workload

```powershell
cd .github/skills/merge-arbiter
node scripts/list-merge-workload.js
```

No `npm install` needed — zero dependencies. A fix only becomes workload once all five upstream
reports exist; the listing shows exactly which are still missing per fix.

### Step 2 — Compute the score (deterministic)

```powershell
node scripts/compute-score.js --all
```

Reads all five reports plus `scoring.json`, applies the hard gates, computes the weighted score
against the severity-scaled threshold, and writes `.architect/merge/<id>.score.json`.

### Step 3 — Per fix: read the score, write the narrative

Read `.architect/merge/<id>.score.json` in full. Write
`.architect/merge/<id>.arbitration.json` per
[templates/arbitration.schema.json](./templates/arbitration.schema.json). Your narrative should let
a reviewer understand the decision from your paragraph alone, without opening all five reports.
Only set `override.applied: true` when you have a specific, evidenced reason grounded in one or more
of the five reports — never a general feeling of extra caution or extra confidence.

### Step 4 — Render

```powershell
node scripts/render-verdict.js --all
```

### Step 5 — Report back

Per fix: Decision, score/threshold, which (if any) hard gate triggered, and a link to
`docs/ship/verdict_<id>.md`.

## Constraints

- DO NOT create, edit, rename or delete anything in `docs/fixes/`, `docs/verify/`, `docs/qa/`,
  `docs/build/` or `docs/issues/`.
- DO NOT recompute or restate the score differently from what `compute-score.js` produced — read it,
  don't re-derive it.
- DO NOT set `override.applied: true` without a `reason` citing specific evidence from the upstream
  reports.
- DO NOT treat an override as a way to quietly raise or lower the bar — `render-verdict.js` always
  shows the computed decision next to yours; there is no way to hide the gap.
- DO NOT edit `scoring.json`'s weights/thresholds as part of a single arbitration — that is a
  standing policy change for the user to make deliberately, not something to adjust per-patch.
- DO NOT print the full upstream reports into chat — link to `docs/ship/verdict_<id>.md`.
- No `npm install` is needed for this skill.
