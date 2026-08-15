# Audit Trail — ISSUE-002

## Employee PII and payroll data are exposed to unauthenticated callers and written to application logs

> ⛔ Blocked — not safe to ship.

_Written by the scribe agent on 2026-08-15, independent of outcome — this file exists whether the patch cleared or was blocked._

## Chain of custody

**Issue** — reported as Critical severity: [docs/issues/ISSUE-002-unauthenticated-pii-exposure.md](../../docs/issues/ISSUE-002-unauthenticated-pii-exposure.md) documents two channels — every employee-service endpoint (including salary data) reachable with zero authentication, and PII/salary fields written into application logs at TRACE level.

**Root cause** — [docs/root-cause/root_cause_ISSUE-002.md](../../docs/root-cause/root_cause_ISSUE-002.md): no Spring Security dependency exists anywhere in employee-service, so no filter chain enforces authentication on any endpoint; separately, `logging.level...controller = trace` combined with logging full request/response objects puts PII and salary figures into plaintext logs.

**Blast radius** — [docs/blast-radius/blast_radius_ISSUE-002.md](../../docs/blast-radius/blast_radius_ISSUE-002.md): P0, multi-service — every one of the six services in this system is affected by the shared platform-wide absence of authentication (employee-service directly contains the defect; the other five share the same pattern).

**Fix plan** — [docs/fix-plans/fix_plan_ISSUE-002.md](../../docs/fix-plans/fix_plan_ISSUE-002.md), approved. Deliberately scoped to employee-service only, as the highest-value starting point: adds `spring-boot-starter-security` (deny-by-default filter chain, no custom `SecurityFilterChain` needed), configures an interim basic-auth credential, and reduces the TRACE log statement to log only the employee ID rather than the full entity. The other five services and a DTO-projection fix for CWE-200 are explicitly deferred as follow-ups.

**Fix drafted** — [docs/fixes/fix_ISSUE-002.md](../../docs/fixes/fix_ISSUE-002.md), 3 files changed, matches the plan. Fixer's own compile check reports Compile Failed — see build note below.

**Step 1 verification**: re-scan [FIXED](../../docs/verify/rescan_ISSUE-002.md) — the endpoints now require authentication; behavior-guard [BEHAVIOR_PRESERVED](../../docs/verify/behavior_ISSUE-002.md) — diff stays within stated scope. Red-team found a **real bypass**: [BYPASS_FOUND](../../docs/verify/redteam_ISSUE-002.md), Medium severity, High confidence — the interim credential's fallback default (`spring.security.user.password=${EMPLOYEE_SERVICE_ADMIN_PASSWORD:changeit-interim-credential}`) is committed to source control in plaintext, and nothing in the diff fails fast or warns if the environment variable is left unset at deploy time; `curl -u employee-service-admin:changeit-interim-credential ...` succeeds against any deployment that didn't override it.

**Step 2 gates**: QA [Failed](../../docs/qa/qa_ISSUE-002.md) and build gate [Failed](../../docs/build/build_ISSUE-002.md) — both driven by the same project-wide JDK25/Lombok compile mismatch documented for ISSUE-001 and ISSUE-003, in files this patch does not touch (EmployeeServiceImpl.java, EmployeeAdvice.java).

**Score and decision** — [docs/ship/verdict_ISSUE-002.md](../../docs/ship/verdict_ISSUE-002.md): computed score 30/100 against a 90 threshold (Critical severity), build-gatekeeper hard gate tripped. The merge arbiter did **not** override this decision — unlike the environment-only failures on the other two issues, red-team's finding here is a genuine, patch-caused weakness (a real, currently-exploitable credential, not a build artifact), so **Blocked stands**.

Full scored decision: [docs/ship/verdict_ISSUE-002.md](./verdict_ISSUE-002.md)
