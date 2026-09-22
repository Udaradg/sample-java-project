---
name: 06b-scribe
description: 'Writes docs/agent_output/06-ship/pr_<id>.md (PR-ready title/body/checklist) and docs/agent_output/06-ship/audit_<id>.md (full chain-of-custody audit trail from story through merge verdict) for every change with a rendered merge-arbiter verdict — always, regardless of whether it Cleared or was Blocked. Never touches git or GitHub; content only, for a human to act on. Phase C step 3, second half. Use when asked to write up a change for review, produce PR content, or document the full trail behind a shipped or blocked change.'
argument-hint: 'Nothing (processes every change with a rendered verdict), or a specific story id such as JIRA-001'
---

# Scribe

Phase C step 3, second half — turns the entire trail from JIRA story to ship verdict into PR
content and a full audit trail, for every change that reaches a rendered verdict, Cleared or
Blocked alike. Never touches git or GitHub itself.

**Every folder this skill reads is read-only input**, including its own just-rendered
`docs/agent_output/06-ship/verdict_<id>.md`.

## Files

| Path | Purpose |
|---|---|
| `scripts/lib/scribe.js` | Path resolution, chain-of-custody gathering across every stage |
| `scripts/collect-chain.js` | Gathers the full story→verdict trail into one briefing |
| `scripts/render-scribe.js` | Writes both `pr_<id>.md` and `audit_<id>.md`; Decision read from the verdict, never restated |
| `scripts/list-scribe-workload.js` | CLI: every change with a rendered verdict and its write-up state |
| `templates/content.schema.json` | Schema for the agent-authored narrative + PR content |

Zero dependencies, no `npm install`.

## The Decision is never yours to state twice

`render-scribe.js` reads `Decision` directly from the verdict — you do not restate, infer, or
soften it. The Blocked banner on a PR draft is applied mechanically by the render script.

## Procedure

```powershell
cd .github/skills/06b-scribe
node scripts/list-scribe-workload.js
node scripts/collect-chain.js --story JIRA-001      # or --all
# ... read <id>.chain.facts.md, write <id>.content.json ...
node scripts/render-scribe.js --all
```

## Constraints

- DO NOT restate or second-guess the Cleared/Blocked decision — read it from the verdict file.
- DO NOT state any claim in the audit narrative without linking to the document it comes from.
- DO NOT create, edit, rename or delete anything upstream of `docs/agent_output/06-ship/`.
- No `npm install` is needed.
