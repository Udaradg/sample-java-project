---
name: 04d-version-migration
description: 'Migrates a Java project to a new language level and/or framework version — Spring Boot 3 to 4, Java 17 to 21, or any jump with a reference pack in references/. Reads the Neo4j code knowledge graph to find where the application is actually coupled to the framework, gates on a green starting point (round 0 must build, pass every test and run cleanly), then puts a colour-coded migration plan in front of a human and refuses to change a single version until they approve it. Once approved it upgrades the declared versions per the reference pack, iterates build rounds on the target JDK — reading each build failure and changing the source it points at — until the build is green, re-probes the running application, writes the result into the project and builds it there, and renders docs/agent_output/04-remediation/migration_plan_<slug>.md and migration_<slug>.md plus a cumulative migration_<slug>.diff. Every round happens in a sandbox copy; the project is written once, at the end, from a green sandbox, with a backup and a one-command revert. Use when asked to upgrade or migrate a framework version, move to a newer Java version, modernise a legacy build, or produce a migration plan or report.'
argument-hint: 'The migration being asked for, e.g. "Spring Boot 3 to 4" or "migrate to Java 21", optionally with the project path'
---

# Version Migration

The migration arm of `04_fix-generator`. Where `04b-fixer` and `04c-dependency-upgrader` implement
an approved fix for a diagnosed defect, this skill handles a different kind of change entirely: a
whole project moving to a newer language level and/or framework generation, where nothing is broken
to begin with and the goal is to arrive on the other side with identical behaviour.

That difference drives everything about how this skill works:

- **A migration is not one patch, it is a sequence of rounds.** The first build after a version bump
  is *supposed* to fail. Each failure names the next set of source changes. The skill records every
  round so the report can show the migration as the sequence it actually was.
- **The compiler is the authority; the reference pack is the map.** Rules come from
  `references/<pack>.md`, but a rule is only applied because a build round failed in the way that
  rule describes — never because the pack mentions it.
- **Behaviour is the acceptance criterion, not compilation.** The application is exercised on the
  old runtime before anything changes and on the new runtime once it is green, and the two are
  compared request by request. A green build with no behavioural evidence is an unfinished
  migration.
- **The architecture graph decides where to look; the reference pack decides what to do there.**
  Before anything is proposed, the Neo4j code knowledge graph is read for the two facts that
  actually predict a migration's shape: where the application touches the framework (the types it
  extends and implements, the annotations it is wired by, the coordinates it declares) and what
  depends on those points. A generation jump breaks code exactly there and nowhere else, so a plan
  built on measured coupling is a different object from a plan built on guessing which files the
  pack's rules might land in.
- **A human decides whether it happens at all.** Once round 0 is green, the migration stops and
  renders a plan — what would move, what is expected to change and why, what could go wrong, what
  it deliberately will not do — and waits. The scripts refuse to change a version until a person
  has set that plan's Status to `Approved`, and the reviewer's own words are carried forward into
  every later revision and into the final report.
- **It starts from green or it does not start.** Round 0 must compile, pass every test, and serve
  every probe cleanly on the JDK the project uses today. This is a gate, not a note: measured
  against a broken starting point, every later failure is unattributable and the whole report
  proves nothing. A red round 0 ends the run — the project is made green first, as its own change.
- **It ends in the project.** Every round happens in a sandbox copy under
  `.github/.pipeline-context/version-migration/<slug>/workspace/`, and the last step writes that
  result into the project and builds it there. A migration that only ever existed in
  `.pipeline-context/` has migrated nothing. The write is backed up and revertible, and refuses
  unless the final round was green.

Nothing in this skill is specific to any framework. The scripts know about JDKs, build tools,
compiler errors and HTTP responses; every fact about a particular version jump lives in a reference
pack, and adding a new migration is a matter of writing one.

## When to use

- "Upgrade this app from Spring Boot 3 to 4" / "migrate to Java 21" / "move us off the old framework
  version"
- "What would it take to upgrade X, and what would have to change in the code?"
- "Produce a migration report for the version upgrade"
- Any request to change a *platform or language version* rather than to fix a defect. A defect with
  a root cause report and an approved fix plan belongs to `04b-fixer`; a single vulnerable
  dependency to bump belongs to `04c-dependency-upgrader`; a whole-generation jump belongs here.

## Inputs

| # | Input | Why it is needed |
|---|---|---|
| 1 | The project directory — build descriptor, source, tests, container and CI files | What is being migrated. Read-only |
| 2 | The requested target version(s) | The jump. Ask if the user only said "upgrade" without a target |
| 3 | A reference pack in [`references/`](./references/) matching the jump | The only source of framework-specific rules. No matching pack means the migration does not start — see below |
| 4 | The Neo4j code knowledge graph built by [`01a`](../01a-code-cartographer/SKILL.md) → [`01b`](../01b-context-weaver/SKILL.md) → [`01c`](../01c-graph-forge/SKILL.md) | Where the application touches the framework, and what depends on those points. This is what makes the plan's predicted changes evidence rather than guesses — see Step 2 |
| 5 | The application's own routes and credentials, read from its source and from the graph's endpoint list | Builds the probe list that proves behaviour is preserved |
| 6 | Two JDKs: the version the project builds on today and the target | Round 0 runs on the first, every later round on the second |
| 7 | A project that is green today — builds, passes its tests, and runs | The reference every later round is compared against. Checked, not assumed — see Step 5 |
| 8 | A human reviewer | Approves the migration plan. Nothing changes a version without it — see Step 6 |

**No matching reference pack is a stop condition, not a licence to improvise.** If
`detect-baseline.js` matches nothing, say so plainly and offer to write a pack for the jump first.
Migrating a framework generation from memory produces changes nobody can review against anything.

**A missing graph is not a stop condition, but it is a downgrade, and it is reported as one.**
`collect-graph-context.js` reads Neo4j when it is reachable and falls back to
`.github/.pipeline-context/artifacts.json` when it is not; if neither exists it says so and the
plan is rendered with a banner saying its predictions have no coupling evidence behind them. Build
the graph first when you can — it is the difference between "these six files are coupled to the
framework" and "the reference pack mentions these areas".

**A red baseline is also a stop condition.** Whatever the environment needs to make the project
green — a Docker daemon for Testcontainers, a service the tests reach, a JDK — belongs in place
before round 0, and a test that fails on the code is a pre-existing defect that is fixed and merged
as its own change. Neither is repaired inside the migration: a fix made here is indistinguishable
from the migration's own work in the diff, and it erases the comparison the report is built on.

## Output

Per migration, three things — and they are not the same kind of thing:

1. **The plan, before any of it happens:** `docs/agent_output/04-remediation/migration_plan_<slug>.md`.
   A proposal written for the person who has to approve it, and the checkpoint that gates
   everything after it.
2. **The project itself, migrated.** The new version, in the project directory, building green
   there on the target JDK. This is the deliverable.
3. **The record of how it got there:** `docs/agent_output/04-remediation/migration_<slug>.md` and a
   sibling `migration_<slug>.diff` (the cumulative patch, directly `git apply`-able).

### The plan

Written after round 0 comes back green and before a single version is touched. Badges, diagrams and
a decision at the end, for a reader who may not be an engineer:

- **At a glance** — the **Status** cell a human edits to decide, the revision number, the versions,
  the verified starting point, the number of files predicted to change, the overall risk, and
  whether the architecture evidence is a live graph, a static fallback or absent
- **1. What would move** — a before/after stack diagram and the version matrix
- **2. What the code graph says about this application** — the framework touchpoints drawn as the
  coupling they are, files ranked by exposure, the agent's reading of what that means for the jump,
  and — kept separate and deliberately — what the graph could *not* see
- **3. How the migration would run** — the phases as a flow diagram from the green starting point
  through to the project on the new version, with a forecast of what each phase expects to break
- **4. What is expected to change** — a pie chart of predicted changes by area, then every file
  with what will change, why, the reference rule behind it, the graph evidence, and a confidence
- **5. What could go wrong** — a likelihood × impact grid, then each risk with its mitigation and
  what in the graph makes it real here rather than generic
- **6. How we would know it still works** — the probe list, and a callout naming any endpoint in
  the graph the probes do not cover
- **7. What this migration would not do** — the boundary, stated before the work so it can be
  checked after it
- **8. Getting back if it goes wrong** — the sandbox, the backup, the revert command
- **9. Your decision** — what each status means, the open questions, and a preserved feedback block
- **10. Review history** — every previous revision's feedback and the revision that answered it

**The plan starts at `Status: Proposed` and only a human changes that.** Re-rendering preserves an
`Approved` or `Rejected` decision, carries any reviewer feedback into the review history, and bumps
the revision. `Changes requested` returns to `Proposed` on the next render — the reviewer is being
shown a different plan now, which is the loop closing rather than a decision being discarded.

**That folder is shared with the fix reports** written by `04a`/`04b`/`04c`. Nothing collides: a
migration only ever writes files with the `migration_` prefix, which their index scan ignores, and
the migration table in `04-remediation/README.md` is a self-delimited block written above their
marker, so re-running either renderer preserves the other's index. A migration never creates, reads
as a gate, or edits a `fix_plan_*.md` or `fix_*.md`.

### The report

Written for someone who was not in the room — colour-coded, diagrammed, and honest:

- Badges, a plain-language summary, and an **At a glance** table — result, versions before/after,
  rounds, every file changed, behaviour verdict
- **1. What moved** — a before/after stack diagram and the full version matrix, each row with why
- **2. How the migration went** — the rounds as a flow diagram grouped into the phases they
  actually formed, with the change that provoked the next round written on the arrow between them;
  a ledger of every round; and then, for each round that was not green, **exactly what failed**:
  the files with their line numbers and the message the build printed against each one, or the
  tests with their source file, the assertion that failed, whether the cause was the code or the
  environment, and whether that test was already failing before the migration started
- **3. Round by round** — per round: the command, the JDK, the outcome, errors grouped by kind with
  what that kind means, which files carried them, which tests failed and why, **every individual
  error line** with file and line number, the agent's diagnosis, and the build log
- **4. Source changes the upgrade forced** — grouped by area, with before/after excerpts and the
  reference rule each came from
- **5. Every file that changed** — the complete file-by-file list taken from the patch itself, with
  line counts, what changed in each, and each file's own diff. A changed file with no explanation in
  the migration record is called out rather than passed over. **5.1** then scores the plan's
  forecast against what actually happened: predicted and changed, predicted and untouched, changed
  without being predicted, and forecast rounds against real ones. **5.1** then scores the plan's
  forecast against what actually happened: predicted and changed, predicted and untouched, changed
  without being predicted, forecast rounds against real ones
- **6. Does it still behave the same?** — the before/after probe comparison, request by request
- **7. Changes that were *not* caused by the upgrade** — kept separate, deliberately
- **8. Landing it in the project** — what was written into the project, how the project's own build
  went on the new version, and the migrated project answering its probes. A migration that has not
  reached the project says exactly that here
- **9. What still needs a human** — what the reviewer wrote when they approved the plan, carried
  through verbatim, then follow-ups and residual risk
- **10. The patch** — diffstat, the patch file, and how to apply or revert it

Intermediate files live in `.github/.pipeline-context/version-migration/<slug>/` (gitignored):
`baseline.json`, `graph-context.json` and its readable `graph-context.md` briefing,
`workspace.json`, `workspace/`, `rounds/round-NN.{json,log}`,
`runtime/{baseline,final,applied}.json`, `applied.json`, `pre-apply-backup/`, and the two
agent-written judgement files `plan.json` and `migration.json`.

## Procedure

### Step 1 — Detect the baseline

```powershell
cd .github/skills/04d-version-migration
node scripts/detect-baseline.js --project <path-to-project> --to-java 21
```

Zero dependencies — nothing to `npm install`. Prints and records: the declared language level, the
build tool and its version, the platform parent, every declared dependency and plugin, the container
and CI files, and every JDK installed on this machine. It also matches the project against each
reference pack's `detect:` coordinates and names the pack to follow.

Confirm the suggested pack is the right one, then **read it end to end before touching anything**.
Note the slug it printed — every later command takes it.

### Step 2 — Read the architecture out of the code graph

```powershell
node scripts/collect-graph-context.js --slug <slug>
```

Queries the Neo4j code knowledge graph for the slice of it a migration actually depends on, and
writes `<session>/graph-context.json` plus a readable `<session>/graph-context.md`. **Read the
briefing end to end before predicting anything.** It answers the questions that decide the shape of
the whole migration:

| The graph shows | What it decides |
|---|---|
| Types that extend or implement an `ExternalType` | Where the compiler will fail first. A generation jump lands here before anywhere else |
| Framework annotations, with the files carrying them | The second coupling surface — the contracts a jump renames, relocates or retires |
| Declared Maven coordinates per module | Which starters and BOMs the build-file step has to touch |
| Every `Endpoint`, with its criticality and test hints | The contract that must survive, and therefore the probe list in Step 3 |
| `USES` fan-in and `ctxCriticality` | How far a change at each point reaches — the blast radius each predicted change carries in the plan |
| `ContextNote` cross-cutting facts | Couplings no build round will ever surface, because they have no code edge |

It also prints a **framework-exposure ranking**: files scored by coupling to the framework combined
with how much depends on them. That ranking is where to look, not a prediction that a file changes —
the plan's predicted-change list is the reference pack's rules applied to what the graph actually
shows, and every prediction says which of the two it came from.

Credentials come from `../01c-graph-forge/.env` (a local `.env` here overrides it), and the
`neo4j-driver` is borrowed from whichever sibling skill has it installed — this skill declares no
dependencies of its own. If Neo4j is unreachable the script falls back to `artifacts.json` and says
so; if there is no graph at all it exits non-zero and names what to run. **Never present a static
fallback as "the graph said"** — `graph-context.json` records which source was used and the plan
prints it in a badge.

### Step 3 — Understand the application as it is today

Before any version changes, read the application: its entry point, controllers and routes, security
configuration and credentials, persistence layer, configuration files, and its tests. You are
answering two questions: *what does this application do*, and *how will I know it still does it*.

The graph has already answered most of the first one, and `graph-context.json` carries a
`probe_candidates` array — every endpoint it found, with the criticality and test hints the semantic
layer attached. Start the probe list from that rather than from memory: it is the difference between
covering the real REST surface and covering the endpoints that came to mind. What the graph cannot
supply is exactly what makes a probe prove something — the credentials, an id that exists in the
seed data, and the status each route is contractually supposed to return. Those are yours to add.

Write the answer to the second question as a probe file — the requests that will be replayed on both
runtimes:

```json
{
  "base_url": "http://localhost:8080",
  "auth": { "type": "basic", "username": "demo", "password": "demo123" },
  "readiness": { "path": "/actuator/health", "timeout_seconds": 120 },
  "requests": [
    { "name": "list all",             "method": "GET",  "path": "/api/v1/employees" },
    { "name": "get one",              "method": "GET",  "path": "/api/v1/employees/1" },
    { "name": "not found is 404",     "method": "GET",  "path": "/api/v1/employees/99999" },
    { "name": "unauthenticated is 401","method": "GET", "path": "/api/v1/employees", "no_auth": true },
    { "name": "health",               "method": "GET",  "path": "/actuator/health" }
  ]
}
```

Save it in the session directory the scripts printed. Cover the real endpoints, not just health:
the happy path, an error path, and an authentication boundary, at minimum. Probes that only prove
the process starts prove almost nothing.

### Step 4 — Create the sandbox

```powershell
node scripts/prepare-workspace.js --slug <slug>
```

Copies the project (excluding build output and any VCS metadata) into
`.github/.pipeline-context/version-migration/<slug>/workspace/` and commits it to a throwaway git
repository. **Every edit from here on is made to files under that workspace path, never to the
project.** The commit is what makes the cumulative diff exact at the end.

### Step 5 — Round 0: the green starting point

```powershell
node scripts/run-migration-build.js --slug <slug> --baseline --jdk 17
node scripts/probe-runtime.js --slug <slug> --phase baseline --jdk 17 --probes <session>/probes.json
```

Both must run **before any version is changed**, on the JDK the project uses today. This is the only
opportunity to record what "working" means for this application; there is no way back to it later.

**Both are gates, and both must come back green.** The scripts enforce it and exit non-zero
otherwise:

- The build must use a goal that runs the tests — `package`, `test` or `verify`; `--baseline` with
  `compile`, `test-compile` or `package-skip-tests` is refused. It must end `passed`: everything
  compiles, every test runs, none fails.
- The probe must start the application and every request must answer as expected — no connection
  failures, no 5xx, and no `expect_status` missed. Give the probes an `expect_status` so this
  checks the endpoint's actual contract (a 401 where 401 is right) rather than "some HTTP reply".

**If round 0 is not green, the migration does not start.** Report exactly what failed and stop. The
project is made green first, and how depends on what broke:

- **It does not compile**, or **a test fails on the code** — a pre-existing defect. It is fixed and
  merged as its own change, on the current version, before the migration begins.
- **A test fails on the environment** — no Docker daemon for Testcontainers, a service that is not
  running, a missing JDK. Provide what it needs, or make the test skip itself cleanly on its own
  precondition. Never lower the build goal to step around it: a baseline that skipped the tests
  cannot show that the migration preserved them.
- **The application does not start or a probe misbehaves** — the same rule. Fix the application,
  not the probe list; a probe trimmed until it passes measures nothing.

None of that work happens inside this skill. Fix it in the project, then re-run
`prepare-workspace.js` and round 0 so the sandbox and the baseline both hold the green starting
point. Only then continue to Step 6.

### Step 6 — Write the plan, and get it approved

**This is where the migration stops and waits.** Everything so far has been measurement: nothing has
changed, and nothing will until a human says so.

Write `.github/.pipeline-context/version-migration/<slug>/plan.json` per
[templates/plan.schema.json](./templates/plan.schema.json) (worked example in
[templates/plan.example.json](./templates/plan.example.json)), then:

```powershell
node scripts/render-migration-plan.js --slug <slug>
```

The plan carries only what a script cannot know. Versions come from `baseline.json`, coupling and
endpoint counts from `graph-context.json`, the starting point from round 0 — **do not restate any of
them**. What it must carry:

- `predicted_changes` — the reference pack's rules applied to the coupling the graph actually
  shows. Each entry says which file, what changes, why, the reference rule, **and the graph evidence
  behind it**. A prediction with no graph evidence is allowed — the build file, the Dockerfile and
  configuration properties have no graph edges — but it must say so rather than implying measurement
  it does not have. Set `confidence: low` where it is low; a reviewer can weigh a low-confidence
  prediction, but not a confident wrong one.
- `risks` — with `graph_evidence` saying why each is real *here* rather than generic. "Config
  property renames are invisible to the compiler, and the graph has no configuration edges" is a
  risk; "upgrades can break things" is not.
- `out_of_scope` — the boundary, set before the work so it is enforceable afterwards.
- `open_questions` — what the reviewer actually has to decide.

Then **hand the reviewer the rendered file and stop**. They decide by editing the **Status** cell:

| They set | You do |
|---|---|
| `Approved` | Continue to Step 7 |
| `Changes requested` | Read their feedback, revise `plan.json`, add a `revision_note` saying what you changed and which point it answers, re-render, and ask again |
| `Rejected` | The migration is over. Report that and stop |

```powershell
node scripts/check-plan-approval.js --slug <slug>   # exits non-zero unless Approved
```

**The gate is in the scripts, not just here.** `run-migration-build.js` refuses every round after
round 0 without an approved plan, and `apply-migration.js --to-project` refuses to write the project
without one. Round 0 is deliberately exempt: it measures the project as it stands, changes nothing,
and its result is one of the things the reviewer is shown.

Re-rendering never overwrites a human's decision. An `Approved` or `Rejected` status is preserved,
the feedback block is carried into the review history with the revision that answered it, and the
revision number goes up. `Changes requested` returns to `Proposed` on the next render, because what
the reviewer is now looking at is a different plan.

### Step 7 — Change the declared versions

Apply the reference pack's build-file section inside the sandbox: the parent or BOM version, the
language level (property *and* any explicit compiler configuration), renamed or split artifacts,
and third-party libraries the pack flags as needing a manual bump. Also update the container image
and CI language versions the baseline listed.

Do not pre-emptively rewrite source code in this step, even where the pack says it will be needed.
Let the build tell you. The point is a report where every source change traces to a real failure.

### Step 8 — The round loop

```powershell
node scripts/run-migration-build.js --slug <slug> --jdk 21 --intent test-compile --label "swapped starters and BOM"
```

Each round records the outcome, every error with its file and line, a category per error, what the
build declares at that moment, and the workspace diffstat. Then:

1. **Read the errors the script grouped.** The category tells you the *shape* of the breakage — a
   package that no longer exists, a signature that changed, an artifact that will not resolve.
2. **Look the shape up in the reference pack's symptom table.** Apply the rule it names.
3. **For an error with no matching rule**, work it out from the actual dependency — resolve the
   coordinate, inspect the jar, read the type that replaced it. Never guess an import path.
4. **Edit the sandbox, change nothing else**, and run the next round with a `--label` saying what
   you changed.

Useful `--intent` values, cheapest first: `compile`, `test-compile`, `package`, `verify`. Compile
errors are worth iterating on with `test-compile`; move to `package` once they are clean so tests
actually run. **Run at least one round with the same goal round 0 used** — that is the only pair the
report can compare test counts across, and a migration can break tests without producing a single
compiler error.

Expect the test layer to break a round after the main code — tests only compile once main does.
Keep going until a round comes back green. Every round is kept; a failed round is evidence, not
something to hide.

### Step 9 — Prove the behaviour survived

```powershell
node scripts/probe-runtime.js --slug <slug> --phase final --jdk 21 --probes <session>/probes.json
```

Same probe file, new runtime. The renderer compares the two runs request by request and separates
the two kinds of difference: a **changed status** is a contract break, while a **same status with a
different body** is usually a framework envelope, an embedded timestamp or an unordered collection.
Read the recorded body excerpts in `runtime/{baseline,final}.json` before calling either one a
regression, and say which it is in the behaviour notes. A framework-owned payload that changed shape
(a health document, a default error body) is a real finding for clients even though no application
code changed — report it rather than rounding it down to "unchanged".

### Step 10 — Write the judgement file

Write `.github/.pipeline-context/version-migration/<slug>/migration.json` per
[templates/migration.schema.json](./templates/migration.schema.json) (worked example in
[templates/migration.example.json](./templates/migration.example.json)).

It carries only what a script cannot know: what each round's failures actually meant, why each
change was needed and which reference rule it came from, before/after excerpts for the source
changes, the behaviour verdict, anything changed that the migration did *not* require, follow-ups
and residual risk. Do not restate error counts, versions or probe results — those come from the
recorded facts. **Every round that ran needs a `round_notes` entry; the renderer refuses without
one.**

Two fields carry more weight than their size suggests:

- `diagnosis` is read as the **why**. The report already prints, from the round record, what failed,
  which files and which tests carried it, the line numbers, and the message the build printed
  against each one. Do not spend the paragraph re-listing that. Spend it on what those errors
  *meant* — which API moved, why the failure landed in this layer and not another, why a count went
  up or came back down, and what it ruled out.
- `changes` is what was changed **before** that round, and the report reads it in both directions:
  as this round's starting state, and as the answer to the previous round's failure. A round with
  an empty `changes` therefore reads as "nothing was changed, this round re-ran the same code",
  which is exactly right when the goal was raised instead — so leave it empty in that case rather
  than inventing an entry.

### Step 11 — Render the report

```powershell
node scripts/render-migration-report.js --slug <slug>
```

Writes the report, exports the cumulative patch, and rewrites the index. Fix any validation error it
prints and re-render.

### Step 12 — Complete the migration in the project

```powershell
node scripts/apply-migration.js --slug <slug>                # dry run: lists what would change
node scripts/apply-migration.js --slug <slug> --to-project   # writes the project, then builds it there
node scripts/probe-runtime.js --slug <slug> --phase applied --target project --jdk 21 --probes <session>/probes.json
```

**This step is not optional — it is what makes the project migrated.** Up to here the new version
exists only in a sandbox; the project is still on the old one. Run it as soon as the final round is
green and the final probe is recorded.

`--to-project` backs up every file it is about to overwrite into
`<session>/pre-apply-backup/`, copies the sandbox tree over the project, and then builds the
**project itself** on the target JDK with a goal that runs the tests. Three outcomes:

- `applied-verified` — the files are in place and the project is green on the new version. The
  migration is done. Run the `applied` probe to show the migrated project answering, then re-render.
- `applied-verification-failed` — the files are in place, the project's own build is not green.
  Something the sandbox copy did not carry differs: local configuration, a stale `target/`, a file
  outside the copy. Close that gap, or `--revert` and say so plainly. Do not report success.
- `applied-unverified` — only when `--no-verify` was passed. Unproven, so say so; it is not a
  finished migration.

`node scripts/apply-migration.js --slug <slug> --revert` restores the project from the backup.

Then **re-render** (Step 11) so the report's section 8 records what landed in the project — the
render reads `applied.json` and `runtime/applied.json`, so a report rendered before the apply
truthfully says the migration never reached the project.

### Step 13 — Report back

There are two moments to report, not one.

**At the plan (after Step 6):** say what the graph found, what the plan proposes, and what it says
could go wrong — in a few lines, not a summary of the whole document. Then link the plan and stop.
Name the open questions explicitly, because those are the reason the reviewer has to read it rather
than skim it. Do not start the migration, and do not imply it has started.

**At the end (after Step 12):** lead with the result and the rounds it took, then the versions
moved, the source changes forced, the behaviour verdict, how the forecast compared with what
happened, and — last, because it is the thing that was actually asked for — that the project is now
on the new version and green there. Link to the report; do not paste it, the diff, or build logs
into chat.

## Constraints

- DO NOT edit, create or delete any file in the project directory by hand, at any point. Every
  migration edit goes into the sandbox workspace, and the project is written only by
  `apply-migration.js --to-project` at Step 12, only from a green final round.
- DO NOT stop at a green sandbox. The deliverable is the project on the new version, building green
  there; a report and a patch with the project still on the old version is an unfinished migration.
- DO NOT start a migration with no matching reference pack, and DO NOT invent framework rules from
  memory. Report the gap and offer to write the pack first.
- DO NOT change a single declared version before the plan reads `Status: Approved`. The scripts
  refuse, and getting past them by editing the sandbox and skipping straight to a later round would
  be starting a migration nobody authorised.
- DO NOT set a plan's Status yourself, in any direction, and DO NOT hand-edit a rendered plan
  outside the render script. Only a human approves a migration, by editing that cell themselves.
  DO NOT silently reset an already-`Approved` or `Rejected` plan by re-rendering it.
- DO NOT delete, summarise or paraphrase reviewer feedback when revising a plan. It is carried
  forward verbatim, with a `revision_note` saying what changed in response — a review history that
  keeps only the answers and not the objections is not a review history.
- DO NOT present a prediction backed by nothing as though the graph supported it. `graph_evidence`
  says where each predicted change came from, and "the reference pack says this area changes" is a
  legitimate answer where the graph has no edge — pretending otherwise is not.
- DO NOT describe a static `artifacts.json` read as the code graph. The source is recorded and
  badged for exactly this reason.
- DO NOT skip round 0, or run it after changing a version. A migration with no recorded
  pre-migration build and probe cannot demonstrate anything and must be reported as such.
- DO NOT continue past a red round 0, and DO NOT get past the gate by lowering the build goal,
  deleting or disabling a failing test, or trimming the probe list. The gate is the whole basis of
  the comparison; work around it and the report means nothing.
- DO NOT repair a pre-existing failure inside the migration. It is a separate change, made in the
  project and merged before round 0 is re-recorded — mixed into the migration diff, nobody can tell
  the two apart.
- DO NOT change source code before a build round has failed on it, except where the reference pack's
  baseline section requires it up front (language level, coordinates). Every other change traces to
  a real error.
- DO NOT guess a package, class or coordinate. Resolve it against the dependency tree or the jar —
  the reference pack itself says to prefer what resolves over what it documents.
- DO NOT bundle unrelated work into the migration: no bug fixes, no refactors, no reformatting, no
  new features, no import reordering. If something unrelated must change, record it in
  `out_of_scope_changes` and present it separately.
- DO NOT mutate the machine's `JAVA_HOME`, `PATH` or any global toolchain setting. `--jdk` pins the
  JDK for that child process only.
- DO NOT report a migration as successful when the last round was not green, when the project's own
  post-apply build was not green, or when it was applied with `--no-verify`. DO NOT describe
  behaviour as preserved without a completed before/after probe comparison.
- DO NOT hand-edit a rendered report or the exported diff — change the inputs and re-render.
- DO NOT delete or rewrite a round record to make the history look cleaner. The failed rounds are
  the most useful part of the report.
- DO NOT print full reports, diffs, build logs or probe bodies into chat — link to the files.
- No `npm install` is needed — this skill has zero dependencies of its own.

## Known caveats

- **Reading the live graph needs `neo4j-driver` installed somewhere.** This skill borrows it from
  `01c-graph-forge`, `02-root-cause-analyst` or `03-blast-radius-analyst` rather than declaring it,
  so `npm install` in one of those is what enables the live read. Without it, and without
  `artifacts.json`, `collect-graph-context.js` exits non-zero and names what to run.
- **A graph is a snapshot, and a stale one is worse than none.** The briefing reports how many
  descriptions the graph marks `ctxStale`, and the plan surfaces the count. Re-run
  `01a-code-cartographer` and `01b-context-weaver` if the code has moved since the graph was built —
  predictions drawn from a graph describing older code are predictions about a project that no
  longer exists.
- **Two JDKs must be installed.** `detect-baseline.js` lists what it found. If the target JDK is
  missing, install it or point `MIGRATION_JDK_<major>` at an existing install; the round scripts
  refuse rather than silently building on the wrong one.
- **Maven or Gradle must be resolvable.** A project wrapper (`mvnw`/`gradlew`) is preferred and used
  automatically; otherwise a system install is found on `PATH` or in the conventional locations, or
  `MIGRATION_MVN` can point at one directly.
- **The runtime probe needs a free port.** Default 8080; pass `--port` if something else is using
  it. The probe stops the application again even when a request fails.
- **The apply is undoable, not atomic.** `--to-project` backs up every file it overwrites before it
  writes any of them, and `--revert` restores that backup, but a machine that dies mid-copy leaves
  the project half-written; the backup is still on disk and `--revert` still fixes it.
- **A failed post-apply verification is left in place, not rolled back.** Reverting automatically
  would delete the evidence of why it failed. Read `applied.json`, then decide.
- **A first build on a new BOM downloads a lot.** The first round after a version bump is slow and
  its duration is not comparable with later rounds. `--timeout` (seconds) raises the 900s default.
- **A failing compile is reported with two numbers: error lines and distinct problems.** javac and
  Maven print the same problem twice in different formats, so the raw line count overstates how many
  things are wrong. The report keeps the recorded count and prints the deduplicated one beside it;
  they are not meant to match, and neither is adjusted to flatter the other.
- **Which tests failed is read out of the build log's results block.** If a round's captured log was
  cut short before that block, the test tables fall back to the recorded error lines and may name
  fewer tests than the summary counts. The counts themselves always come from surefire's own
  summary line, so a mismatch between the two means the log was truncated, not that a test was
  hidden.
- **Body-hash comparison is strict.** A response embedding a timestamp or a generated id will differ
  between runs for reasons unrelated to the migration. Judge those cases and say so in the
  behaviour notes rather than pretending the difference is not there.

## Notes

- Self-contained folder — zero dependencies, nothing to `npm install`.
- `scripts/lib/migration.js` holds path resolution, JDK and build-tool discovery, project inventory
  and build-output classification; `scripts/lib/references.js` holds only reference-pack discovery;
  `scripts/lib/plan.js` holds the approval checkpoint and the shared `04-remediation/README.md`
  migration block; `scripts/lib/graph.js` holds the graph queries and the static fallback.
  None of them imports another skill's code — this pipeline duplicates helpers per skill rather than
  coupling skills together, the same choice already made for `04b-fixer` and `04c-dependency-upgrader`.
- The one thing this skill takes from a sibling is *data*, not code: Neo4j credentials from
  `01c-graph-forge/.env` and, at runtime only, its installed `neo4j-driver`. That keeps the
  credentials in one place to rotate and keeps this skill's own dependency list empty. If the driver
  is not installed anywhere, the graph step falls back to `artifacts.json` and says so.
- The plan and the report share the migration block in `04-remediation/README.md`, which is why that
  block lives in `lib/plan.js` and both renderers call the same `rewriteIndex()`. The report scan
  excludes the `migration_plan_` prefix explicitly — without that, a plan for `foo` reads as a
  report for `plan_foo`.
- Error categories in `lib/migration.js` classify by message shape only. They never name a library
  and never propose a fix; that mapping is the reference pack's job, so a new framework needs no
  code change.
- Adding a migration = adding `references/<id>.md` with the front matter documented in
  [`references/README.md`](./references/README.md). No script changes.
- Everything written by this skill lands in `.github/.pipeline-context/version-migration/*`,
  `docs/agent_output/04-remediation/migration_*`, or — at Step 12, through `apply-migration.js`
  alone — the project files the migration changed. Nothing here writes to
  `docs/agent_output/00-issues/`, `02-root-cause/`, `03-blast-radius/`, or any `fix_*` file.
- The gates are in the scripts, not only in this document: `run-migration-build.js --baseline`
  refuses a goal that skips tests and exits non-zero on a red round 0; every later round refuses
  without an approved plan; `probe-runtime.js` exits non-zero when a `baseline` or `applied` probe
  is not clean; `apply-migration.js --to-project` requires an approved plan, refuses a sandbox that
  is not green, and exits non-zero when the project's own build fails; `check-plan-approval.js`
  exits non-zero for anything but `Approved`. An agent that ignores a non-zero exit here is
  defeating the point of the skill.
