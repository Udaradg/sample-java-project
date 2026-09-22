---
name: 05b-build-gatekeeper
description: 'Runs mvn verify and a dependency-tree diff for every change in docs/agent_output/03-development/ that the Developer captured a diff for (Status: Compiled or Compile Failed) inside an isolated git worktree — fully deterministic, no agent-authored judgment anywhere in the output. Phase C step 2, second half. Use when asked to confirm a change builds cleanly, check for dependency drift introduced by a change, or run the build gate before a change can ship.'
argument-hint: 'Nothing (processes every change in docs/agent_output/03-development/), or a specific story id such as JIRA-001'
---

# Build Gatekeeper

Phase C step 2, second half — and the one skill in this whole pipeline with **no agent-authored
content anywhere in its output**. Every fact in `docs/agent_output/05-test-gate/build_<id>.md` comes
straight from `run-build-gate.js`. This is deliberate: there is nothing here for an agent to
interpret, soften, or override — you run the two scripts and relay exactly what they say.

**`docs/agent_output/03-development/` is read-only input.** Nothing here writes to it.

## What it checks

1. **Build:** `mvn verify` (stronger than the Developer's own `compile`/`test-compile` pre-gate),
   applied inside a throwaway `git worktree` — never the real working tree.
2. **Dependency drift:** `mvn dependency:tree`, captured once before the diff is applied and once
   after, in the same worktree — any added/removed line is a dependency the change pulled in or
   dropped that its plan didn't call for.

## Inputs

1. `docs/agent_output/03-development/dev_<id>.md`, Status `Compiled` or `Compile Failed`.
2. The change's diff (`docs/agent_output/03-development/dev_<id>.diff`).

## Output

`docs/agent_output/05-test-gate/build_<id>.md` — Status (`Passed` / `Failed` / `Refused`), full
build output, and the dependency diff. `docs/agent_output/05-test-gate/README.md`'s index is
rewritten on every render run (shared with the QA gate).

Intermediate: `.github/.pipeline-context/build/<id>.result.json` (the script's own output — the
only file this skill's report is built from) and a transient
`.github/.pipeline-context/build/worktrees/<id>/`.

## Procedure

```powershell
cd .github/skills/05b-build-gatekeeper
node scripts/list-build-workload.js
node scripts/run-build-gate.js --story JIRA-001      # or --all
node scripts/render-build-report.js --all
```

No `npm install` needed — zero dependencies. This repo has no committed `mvnw` wrapper, so `mvn`
must be on PATH; every command runs at the worktree root (single Maven module, no submodules).
Report back per change: Status, and one line on the dependency diff (if any). Do not add
interpretation the script's output doesn't already contain.

## Constraints

- DO NOT create, edit, rename or delete anything in `docs/agent_output/03-development/`.
- DO NOT run against a change whose Status is `Refused`. `Compiled` and `Compile Failed` changes are
  both in scope.
- DO NOT write any judgment file for this skill — there is no schema/template here, on purpose. If
  you find yourself wanting to add interpretation to the report, that belongs in the merge
  arbiter's narrative instead, not here.
- No `npm install` is needed — this skill has zero dependencies.
