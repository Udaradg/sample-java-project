# Audit Trail — ISSUE-001

## Unbounded repository findAll() reads whole collections into memory across multiple services

> ✅ Cleared to ship.

_Written by the scribe agent on 2026-08-15, independent of outcome — this file exists whether the patch cleared or was blocked._

## Chain of custody

**Issue** — reported 2026-08-06 by architecture review as High severity: [docs/issues/ISSUE-001-unbounded-findall-usage.md](../../docs/issues/ISSUE-001-unbounded-findall-usage.md) documents two unbounded `MongoRepository.findAll()` reads (sheduler-service's `GET /api/v1/employee` and report-service's `GET /api/v1/export`) that materialize the entire employee collection with no pagination, limit or filter.

**Root cause** — [docs/root-cause/root_cause_ISSUE-001.md](../../docs/root-cause/root_cause_ISSUE-001.md) traces both symptoms to the same pattern: `EmployeeSchedulerServiceImpl.getAllEmployees()` and `EmployeeReportServiceImpl.getEmployees()` both call `findAll()` with zero arguments, so response cost is dictated entirely by collection size.

**Blast radius** — [docs/blast-radius/blast_radius_ISSUE-001.md](../../docs/blast-radius/blast_radius_ISSUE-001.md) scored this P2/multi-service: two services broken (sheduler-service, report-service), two public endpoints down, one scheduled job (`WomenDaySchedulerImpl`) affected, employee-service and department-service marked at-risk via shared MongoDB infrastructure.

**Fix plan** — [docs/fix-plans/fix_plan_ISSUE-001.md](../../docs/fix-plans/fix_plan_ISSUE-001.md), approved (Status: Approved) after human review. Deliberately scoped to sheduler-service only: caps `getAllEmployees()` at a 500-record page and adds a dedicated `findByGender`/`getFemaleEmployees()` path so the Women's Day job queries MongoDB directly instead of filtering in Java. report-service's identical defect is explicitly deferred as a separate follow-up because it needs streaming, not pagination (an export must return every record, not a capped page).

**Fix drafted** — [docs/fixes/fix_ISSUE-001.md](../../docs/fixes/fix_ISSUE-001.md), 4 files changed, matches the plan. Fixer's own isolated-worktree compile check reports Compile Failed — see build note below.

**Step 1 verification** (parallel, static/reasoning): re-scan [FIXED](../../docs/verify/rescan_ISSUE-001.md) — the unbounded signature is gone from the patched path; red-team [NO_BYPASS_FOUND](../../docs/verify/redteam_ISSUE-001.md) — no adversarial path around the new page cap or the derived query; behavior-guard [BEHAVIOR_PRESERVED](../../docs/verify/behavior_ISSUE-001.md) — every changed line traces to the plan's stated scope.

**Step 2 gates** (deterministic): QA [Failed](../../docs/qa/qa_ISSUE-001.md) and build gate [Failed](../../docs/build/build_ISSUE-001.md) — both report the identical single compiler error, `cannot find symbol: method getName()`, at a line in `WomenDaySchedulerImpl.java` that sits outside every hunk this patch's diff touches. This is the project-wide JDK25/Lombok annotation-processing mismatch (this sandbox's only JDK is newer than Lombok reliably supports for this project), independently confirmed by compiling report-service's completely unmodified baseline with the identical failure signature.

**Score and decision** — [docs/ship/verdict_ISSUE-001.md](../../docs/ship/verdict_ISSUE-001.md): computed score 60/100 against an 85 threshold (High severity), with the build-gatekeeper hard gate tripped by the environment failure, computing to Blocked. The merge arbiter overrode this to **Cleared**, citing the line-for-line cross-check proving both gate failures are the pre-existing environment defect and not the patch, weighed against unanimous, unambiguous Step 1 findings. The override record carries a mandatory caveat: this environment has never produced a real green build for this patch, and qa-runner/build-gatekeeper must be re-run on a JDK17-compatible toolchain before this actually merges.

Full scored decision: [docs/ship/verdict_ISSUE-001.md](./verdict_ISSUE-001.md)
