# Issue & Defect Register

Reported issues and vulnerabilities for this workspace. Each file describes **what is wrong and how
it shows up** — symptoms, reproduction, and impact only. Diagnosis lives separately, in
[`docs/root-cause/`](../root-cause/), produced by the **Root Cause Analyst** agent
(`.github/agents/root-cause-analyst.agent.md`).

> **This folder is owned by whoever reports the issue.** Add issues here by hand, from your tracker,
> or from any upstream process. The Root Cause Analyst agent treats it as read-only input: it reads
> every file carrying an `issue_id`, produces one root cause report per issue, and never creates or
> edits an issue file. Drop a new issue in, re-run the agent, and it picks it up.

| ID | Title | Type | Severity | Services | Status |
|---|---|---|---|---|---|
| [ISSUE-001](./ISSUE-001-recursive-create-department.md) | Creating a department never completes and crashes the department-service worker thread | Defect | Critical | `department-service` | Open |
| [ISSUE-002](./ISSUE-002-unbounded-findall-usage.md) | Unbounded repository `findAll()` reads whole collections into memory across multiple services | Vulnerability | High | `sheduler-service`, `report-service` | Open |

Keep this table in step with the files in the folder — it is for humans. The pipeline itself
discovers issues by scanning for front matter, not from this list, so a new issue works whether or
not the table is updated.

## File Format

Every issue file starts with a YAML front-matter block. The Root Cause Analyst pipeline reads these
keys to locate the affected code in `artifacts.json` and in the Neo4j graph, so keep them accurate.
A markdown file without an `issue_id` is not treated as an issue and is skipped.

```yaml
---
issue_id: ISSUE-003              # unique; also names the output file root_cause_ISSUE-003.md
title: One-line summary
type: Defect                     # Defect | Vulnerability | Performance | Security
severity: Critical               # Critical | High | Medium | Low
status: Open                     # Open | In Progress | Fixed | Closed
reported_on: 2026-08-06
reported_by: Who or what found it
affected_services:               # Maven module names, exactly as on disk
  - department-service
affected_symbols:                # Type.method — resolved against .architect/artifacts.json
  - DepartmentController.createDepartment
affected_files:                  # Repo-relative paths
  - department-service/src/main/java/.../DepartmentController.java
entry_points:                    # REST endpoints, as "METHOD /path"
  - POST /api/v1/department
---
```

Recommended body sections: Summary, Affected Area, Observed Behavior, Expected Behavior, Steps to
Reproduce, Impact, Detection Notes.

## Naming

`ISSUE-<nnn>-<short-kebab-slug>.md` — the numeric ID must match `issue_id` in the front matter.
The `issue_id` also names the output: `docs/root-cause/root_cause_<issue_id>.md`.

## Checking what has been analysed

```powershell
cd .github/skills/root-cause-analyst
node scripts/list-issues.js            # every issue and its pipeline state
node scripts/list-issues.js --pending  # only those without a report yet
```
