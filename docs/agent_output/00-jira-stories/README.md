# JIRA Story Backlog

Brownfield development stories for this workspace, one markdown file per story:
**`jira-story-<NNN>.md`**. Each file **is** the ticket — title, description, and acceptance criteria
— and is the pipeline's read-only input, read through
[`.github/skills/00-jira-story-register`](../../../.github/skills/00-jira-story-register/). Diagnosis
of *how* to implement a story lives separately, in
[`docs/agent_output/02-story-analysis/`](../02-story-analysis/), produced by the **Story/Impact
Analyst** agent (`.github/agents/02_story-analyst.agent.md`).

> **This backlog is owned by whoever files the story.** Add a story by creating a new
> `jira-story-<NNN>.md` file (copy an existing one as a template) and re-run the agents from
> `02_story-analyst`. Every agent that consumes stories treats this folder as read-only input:
> nothing in the pipeline writes to a story file, including its `Status` field — that is a human's
> call, same as the `Status` on a fix plan further down the pipeline.

## Current backlog

| ID | Title | Type | Priority | Status |
|---|---|---|---|---|
| JIRA-001 | Add pagination, sorting and filtering to the employee listing endpoint | Story (Enhancement) | High | Ready for Development |
| JIRA-002 | Fix duplicate-email validation checking the wrong field | Bug | Critical | Ready for Development |

This table is for humans. The pipeline reads the story files themselves, so a new story works
whether or not this table is updated.

## File contract

Every story file has three parts, in order — see either file above for a worked example:

1. **Title line** — `# JIRA-001 — <title>`. Everything before the em dash is the `id`, everything
   after is the `title`.
2. **Metadata table** — `| Field | Value |` with bolded field names: `**Type**` (`Story`/`Bug`/
   `Task`), `**Priority**`, `**Status**`, `**Component**`, `**Reported by**`, `**Reported on**`,
   `**Labels**`.
3. **Sections**: `## Summary`, `## Description`, `## Acceptance Criteria` (numbered list — this is
   what the Story/Impact Analyst plans against and what the test agents check the implementation
   satisfies), `## Out of Scope`, `## Risks / Notes for Implementation`.

## Checking the register

```powershell
cd .github/skills/00-jira-story-register
node scripts/list-register.js          # every story, as the pipeline parses it
node scripts/list-register.js --full   # plus the full story body
```

## Checking what has been analysed

```powershell
cd .github/skills/02-story-analyst
node scripts/list-workload.js          # every story and its pipeline state
```
