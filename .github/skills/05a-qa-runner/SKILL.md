---
name: 05a-qa-runner
description: 'Drafts exactly one new regression test per change in docs/agent_output/03-development/ that the Developer captured a diff for (Status: Compiled or Compile Failed), mocking Spring Data repositories rather than using a live database, then a script applies and runs it for real inside an isolated git worktree. Use when asked to write a regression test for a change, run the test suite scoped to a story, or confirm a change is covered by a test.'
argument-hint: 'Nothing (processes every change with a captured diff), or a specific story id such as JIRA-001'
---

# QA Runner

Phase C step 2, first half — drafts one new regression test per change, then a **script** applies
and runs it for real. Execution and pass/fail are entirely script-decided; the agent's only creative
work is drafting the test.

**`docs/agent_output/03-development/` is read-only input.** Nothing here writes to it.

## Why the test is mocked, not database-backed

This repo has no embedded-database test dependency (no Testcontainers, no `@DataJpaTest`-friendly
setup for a throwaway worktree), so the new test must mock the relevant Spring Data repository
(e.g. Mockito-mock `EmployeeRepository`, stub the method the change added or fixed, and assert on
the service's resulting behavior) so it is both meaningful for the change and actually runnable in
this sandbox.

## Files

| Path | Purpose |
|---|---|
| `scripts/lib/qa.js` | Path resolution, development-report parsing, isolated worktree + Maven helpers |
| `scripts/list-qa-workload.js` | CLI: every change and its QA drafting/gate state |
| `scripts/run-qa-gate.js` | Applies the change diff + the new test diff together, runs the test for real |
| `scripts/render-qa-report.js` | Renders the agent's test-plan + the script's result into the report |
| `templates/test-plan.schema.json` / `.example.json` | Schema + worked example for the agent's plan |

Zero dependencies, no `npm install`.

## Inputs

1. `docs/agent_output/03-development/dev_<id>.md`, Status `Compiled` or `Compile Failed`.
2. The change's diff (`docs/agent_output/03-development/dev_<id>.diff`).
3. The story's acceptance criteria, for what the new test should lock in.

## Output

`docs/agent_output/05-test-gate/qa_<id>.md` — Status (`Passed`/`Failed`/`Refused`), what the test
proves, and the real per-test output. `docs/agent_output/05-test-gate/README.md`'s index is
rewritten on every render run (shared with the build gate).

Intermediate: `.github/.pipeline-context/qa/<id>.test-plan.json` + `<id>.new-test.diff` (agent
output), `<id>.result.json` (the script's own output — the only file this skill's report is built
from), and a transient `.github/.pipeline-context/qa/worktrees/<id>/`.

## Procedure

```powershell
cd .github/skills/05a-qa-runner
node scripts/list-qa-workload.js
# Draft <id>.test-plan.json + <id>.new-test.diff (the agent's job), then:
node scripts/run-qa-gate.js --story JIRA-001      # or --all
node scripts/render-qa-report.js --all
```

No `npm install` needed — zero dependencies. This repo has no committed `mvnw` wrapper, so `mvn`
must be on PATH; every command runs at the worktree root (single Maven module, no submodules).

## Constraints

- DO NOT create, edit, rename or delete anything in `docs/agent_output/03-development/`.
- DO NOT run against a change whose Status is `Refused`. `Compiled` and `Compile Failed` changes are
  both in scope.
- DO NOT hand-edit `<id>.result.json` — that file is the deterministic gate's own output.
- DO NOT write a test needing infrastructure this sandbox lacks unless truly unavoidable — and even
  then, report exactly what the script determined, including a failure to even start.
- No `npm install` is needed.
