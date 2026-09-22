---
name: 00-jira-story-register
description: 'Reads the markdown JIRA stories under docs/agent_output/00-jira-stories/ — one file per story — and serves them to every agent that consumes stories. Owns the story-file contract and parses each file into a plain object. Use when asked what stories are queued for development, to check how a story parses, or when adding a new story.'
argument-hint: 'Nothing (lists every story), or --full to include the full story body'
---

# JIRA Story Register

Step **00** — the pipeline's input, before any agent runs. Two skills read stories (`02-story-analyst`
and `06b-scribe`); they both read them through this one, so the story-file contract is defined in
exactly one place.

**The register is read-only input.** It is owned by whoever files the story — a human, a JIRA export,
a backlog groom. Nothing in this skill, or anywhere else in the pipeline, writes to
`docs/agent_output/00-jira-stories/jira-story-*.md`.

## Why plain markdown, not a spreadsheet

The vulnerability-remediation pipeline this harness started from read one row per finding from an
Excel register, because that's how scanner exports arrive. A brownfield development backlog already
arrives as one ticket per file — closer to how a JIRA story reads when exported — so there is no
spreadsheet round-trip to build or maintain. Each `jira-story-<NNN>.md` file is both the human-editable
ticket and the pipeline's input; nothing else needs to reconstruct it.

## File contract

Every story file the register recognizes (`jira-story-<id>.md`) has three parts, in order:

1. **Title line** — `# JIRA-001 — Add pagination, sorting and filtering to the employee listing endpoint`.
   Everything before the em dash is the story `id`; everything after is the `title`.
2. **Metadata table** — a `| Field | Value |` table with bolded field names: `**Type**`, `**Priority**`,
   `**Status**`, `**Component**`, `**Reported by**`, `**Reported on**`, `**Labels**`. Unknown rows in
   the table are ignored, so extra tracker fields can sit alongside these.
3. **Sections**, each its own `##` heading: `Summary`, `Description`, `Acceptance Criteria`,
   `Out of Scope`, `Risks / Notes for Implementation`. `Acceptance Criteria` and `Out of Scope` are
   parsed as lists (numbered or bulleted); the others are parsed as free text.

`Status` is the one field a human is expected to change during the story's life
(`Ready for Development` → `In Development` → `Done`, or similar) — the register never writes it.

## Files

| Path | Purpose |
|---|---|
| `scripts/lib/register.js` | File contract, parsing, story lookup |
| `scripts/list-register.js` | CLI: dump the register exactly as the pipeline parses it |

Zero dependencies, no `npm install`.

## Reading it from another skill

```js
const register = require('../../../00-jira-story-register/scripts/lib/register');

register.listStories(STORIES_DIR, rel);           // every story, sorted by id
register.readStory(STORIES_DIR, 'JIRA-001', rel);  // one story, or null
register.resolveStory(STORIES_DIR, id, rel);       // one story, or throws naming what exists
```

Each story object carries:

```
id title type priority status reportedBy reportedOn   scalars
labels                                                 array, split on newline or comma
summary description risks                              free-text sections
acceptanceCriteria outOfScope                           list sections, one entry per item
body                                                    the full, untouched file text
file relativeFile                                       the story file this came from
```

## Usage

```powershell
cd .github/skills/00-jira-story-register
node scripts/list-register.js
node scripts/list-register.js --full            # include the full story body
node scripts/list-register.js --story JIRA-001
```

## Adding a new story

1. Create `docs/agent_output/00-jira-stories/jira-story-<NNN>.md` following the file contract above —
   copy an existing story as a template.
2. `node scripts/list-register.js` to confirm it parses and its acceptance criteria were picked up.
3. Re-run `02_story-analyst` for that story id.
