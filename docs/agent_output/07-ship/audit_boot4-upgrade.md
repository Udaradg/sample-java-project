# Migration Audit Trail — boot4-upgrade

> **Audit type:** version-migration review adapted from the standard Phase C PR/audit stage.
>
> **Scope:** Spring Boot 3.5.0 to 4.1.1 and Java 17 to 21.
>
> **Decision model:** this audit records evidence and release conditions. It does not manufacture a standard merge-arbiter score because no migration-specific QA/build gate reports or standard `fix_boot4-upgrade` report exist.

## 1. Change identity

| Field | Recorded value |
|---|---|
| Migration | Spring Boot 3.5.0 to 4.1.1 on Java 21 |
| Migration artifact | [migration_boot4-upgrade.md](../04-remediation/migration_boot4-upgrade.md) |
| Plan | [migration_plan_spring-boot-3-to-4.md](../04-remediation/migration_plan_spring-boot-3-to-4.md) |
| Diff | [migration_boot4-upgrade.diff](../04-remediation/migration_boot4-upgrade.diff) |
| Target project state | Applied to the project and green in the recorded migration run |
| Final recorded build | Maven `clean package` on JDK 21, passed |
| Standard issue ID | None; this is a platform migration |
| Standard CWE | Not applicable |

## 2. Approval and provenance

The migration report says the plan was approved and identifies the approver as Vihanga22365, relayed on 2026-09-10. However, the attached plan is internally inconsistent: its At-a-glance table shows `Approved`, while section 9 still says `Proposed`, leaves the reviewer and decision date unset, and retains the placeholder text that no decision has occurred.

**Audit finding:** preserve the migration result, but normalize the plan metadata before treating approval as a complete release-control record. The audit cannot infer approval beyond what the source documents state.

Source: [migration plan](../04-remediation/migration_plan_spring-boot-3-to-4.md), [migration report](../04-remediation/migration_boot4-upgrade.md).

## 3. Change performed

The recorded migration changed the build/runtime baseline and seven files. The main changes were:

- Parent and managed platform moved to Spring Boot 4.1.1.
- Java/compiler level moved from 17 to 21.
- Servlet starter changed to `spring-boot-starter-webmvc`.
- MVC/JPA test support moved to modular Boot 4 test starters.
- Raw `spring-security-test` changed to `spring-boot-starter-security-test` after five `@WithMockUser` tests returned 401 in the intermediate round.
- Jackson configuration moved from `com.fasterxml.jackson.*` and `JavaTimeModule` to the Jackson 3 `tools.jackson.*` customization API.
- Actuator health types moved to `org.springframework.boot.health.contributor`.
- Test annotations and mapper types moved to their Boot 4 equivalents.

No business service, controller, repository, entity, DTO, database schema, or production security-chain logic was intentionally changed according to the migration report.

Source: [migration report](../04-remediation/migration_boot4-upgrade.md).

## 4. Build and runtime evidence

The recorded migration ledger contains six rounds:

- Round 0: Boot 3.5.0/JDK 17 baseline passed with 19 tests.
- Round 1: main-source compilation exposed Jackson 3 and actuator package/API changes.
- Round 2: test compilation exposed modular test-starter, annotation, and mapper changes.
- Round 3: main and test sources compiled.
- Round 4: five MockMvc tests returned 401 because the test SecurityContext bridge was absent.
- Round 5: Boot security-test starter correction restored all 19 tests.

The final recorded result was 19 tests passed, 0 failed, 0 errored, with all 15 runtime probes returning their expected statuses. The evidence demonstrates successful migration for the exercised build and probe paths; it is not proof of compatibility with every external consumer or deployment environment.

Source: [migration report](../04-remediation/migration_boot4-upgrade.md).

## 5. Independent verification

### Re-scan

Verdict: `FIXED`, high confidence. Eight original signatures were absent from the patched artifact, including Jackson 2 mapper types, the old actuator health package, old test-slice packages, `@MockBean`, and the raw Spring Security test dependency.

This verifies removal of known migration failure signatures. It does not audit every deprecated property, transitive dependency, Docker image, or runtime behavior.

Source: [re-scan report](../05-verify/rescan_boot4-upgrade.md).

### Red-team recon

Verdict: `NO_BYPASS_FOUND`, medium confidence. No alternate framework boundary was shown to bypass authentication, exception handling, or the tested repository paths. The review explicitly leaves live PostgreSQL behavior and silent Boot 4 configuration-property changes uncertain.

Source: [red-team report](../05-verify/redteam_boot4-upgrade.md).

### Behavior guard

Verdict: `BEHAVIOR_CHANGED`, high confidence. Statuses remained stable across the recorded 15 probes, and application-owned 404/validation responses remained stable. However, the framework-generated missing-query-parameter `application/problem+json` response omitted `type=about:blank` and changed from five members to four.

This is a client-visible schema change even though the HTTP status remains 400. It is the principal release-blocking question in the current evidence set.

Source: [behavior report](../05-verify/behavior_boot4-upgrade.md).

## 6. Gate completeness

The standard ship pipeline expects a fix report plus five upstream inputs: re-scan, red-team, behavior, QA, and build. For this migration:

| Gate/input | State | Audit interpretation |
|---|---|---|
| Migration report and diff | Present | Migration-specific replacement for a standard fix report |
| Re-scan | Present | Passed: known signatures removed |
| Red-team | Present | No bypass found, medium confidence |
| Behavior guard | Present | Changed: one unapproved framework response-schema difference |
| QA report | Missing | Recorded 19-test package result exists, but no migration-specific QA artifact exists |
| Build-gate report | Missing | Recorded Maven package result exists, but no standard build-gate artifact exists |
| Standard merge verdict | Missing | Cannot be computed by the normal arbiter workload |

No score or Cleared/Blocked verdict is asserted here because the normal scoring inputs are incomplete and the migration is not a standard issue-fix workload.

## 7. Open release conditions

1. Decide whether the missing `problem+json.type` field is an accepted Boot 4 contract change. If required, add an application-owned compatibility response and regression test.
2. Run a migration-specific QA gate and record the exact tests and environment used.
3. Run the migration-specific build gate, including dependency resolution checks for accidental Boot 3/Jackson 2 artifacts.
4. Build and run the Java 21 Docker image.
5. Validate the native query against PostgreSQL rather than only H2/test evidence.
6. Audit `application.yml` and `application-test.yml` with a Boot 4 property-binding/properties-migrator check.
7. Correct the plan's approval metadata: status, reviewer, decision date, and feedback.

## 8. Audit conclusion

The migration has a credible recorded green build and broad evidence that the intended framework/API migration was completed. The evidence does not support representing it as fully cleared for release yet: one framework-owned error payload changed schema outside the explicitly approved scope, and PostgreSQL/configuration/container checks remain incomplete. This audit therefore records the change as **conditionally reviewable**, with the release conditions above unresolved.

## 9. Source index

- [Migration plan](../04-remediation/migration_plan_spring-boot-3-to-4.md)
- [Migration report](../04-remediation/migration_boot4-upgrade.md)
- [Migration diff](../04-remediation/migration_boot4-upgrade.diff)
- [Re-scan](../05-verify/rescan_boot4-upgrade.md)
- [Red-team recon](../05-verify/redteam_boot4-upgrade.md)
- [Behavior guard](../05-verify/behavior_boot4-upgrade.md)
