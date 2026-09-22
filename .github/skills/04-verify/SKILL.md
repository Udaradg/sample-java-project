---
name: 04-verify
description: 'Runs three parallel, static/reasoning-based checks against every change in docs/agent_output/03-development/ that the Developer captured a diff for, Compiled or Compile Failed alike: acceptance-check (does every acceptance criterion hold in the patched code?), edge-case review (does the change survive boundary/error conditions the plan did not cover?), and behavior guard (did real behavior change beyond what the plan intended?). No live database or deployed instance is used. Use when asked to re-verify a change, check for gaps in an implementation, or confirm a change did not alter unrelated behavior.'
argument-hint: 'Nothing (processes every change with a captured diff), or a specific story id such as JIRA-001'
---

# Verification Layer

Phase C step 1 — three independent, parallel, static/reasoning-based checks against every change in
[`docs/agent_output/03-development/`](../../../docs/agent_output/03-development/) that `03_developer`
actually captured a diff for (`Status: Compiled` **or** `Compile Failed` — a failed compile doesn't
stop this stage, since none of these three checks invoke a compiler). Run by
`04_existing-app-test-agent`.

**`docs/agent_output/03-development/`, `docs/agent_output/02-story-analysis/` and
`docs/agent_output/00-jira-stories/` are all read-only input.** Nothing here writes to them.

## The three checks

1. **Acceptance-check** — re-derives the story's acceptance criteria and checks each one against
   the *patched* source, materialized by applying the change's own diff inside a throwaway `git
   worktree` (never the real working tree).
2. **Edge-case review** — enumerates concrete boundary/error conditions against the new code that
   the plan didn't explicitly cover, grounded in the plan's own risk notes and the story's
   out-of-scope list.
3. **Behavior guard** — separates changes the plan explains from anything it doesn't (log format,
   exception types, return values, field visibility), aided by a cheap, non-authoritative
   method-signature diff.

None of the three run a live database or a deployed instance — this repo has no embedded-database
test dependency, so each collector applies the diff in a worktree, reads the resulting file
content, and removes the worktree.

## Files

| Path | Purpose |
|---|---|
| `scripts/lib/verify.js` | Shared path resolution, change/plan/story parsing, worktree helper |
| `scripts/collect-acceptance.js` / `render-acceptance.js` | Acceptance-check pair |
| `scripts/collect-edgecase.js` / `render-edgecase.js` | Edge-case review pair |
| `scripts/collect-behavior.js` / `render-behavior.js` | Behavior guard pair |
| `scripts/list-workload.js` | CLI: every change and its report status across all three checks |
| `templates/*.schema.json` / `*.example.json` | Schema + worked example per check |

Zero dependencies, no `npm install`.

## Usage

```powershell
cd .github/skills/04-verify
node scripts/list-workload.js

node scripts/collect-acceptance.js --all
node scripts/collect-edgecase.js --all
node scripts/collect-behavior.js --all

# ... read each *.facts.md, write each *.verdict.json ...

node scripts/render-acceptance.js --all
node scripts/render-edgecase.js --all
node scripts/render-behavior.js --all
```

## Output

`docs/agent_output/04-verify/acceptance_<id>.md`, `edgecase_<id>.md`, `behavior_<id>.md`, plus a
shared `README.md` index rewritten by every render script.

Intermediate: `.github/.pipeline-context/verify/<id>.<check>.facts.json`/`.facts.md` (script output)
and `.verdict.json` (agent output), and a transient `.github/.pipeline-context/verify/worktrees/<id>/`.

## Constraints

- DO NOT create, edit, rename or delete anything in `docs/agent_output/03-development/`,
  `docs/agent_output/02-story-analysis/` or `docs/agent_output/00-jira-stories/`.
- DO NOT run any of the three checks against a change whose Status is `Refused` — the Developer
  never captured a diff, so there is nothing to check.
- DO NOT treat an unmet criterion, a found gap, or an out-of-scope change as something to fix here
  — that is `03_developer`'s job on a revised, re-approved plan. This skill only reports.
- No `npm install` is needed for this skill.
