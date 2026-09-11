# Migration Change Review — Spring Boot 4.1.1 / Java 21

> **Migration review artifact.** This document adapts the standard PR scribe output for a version migration. It is not a standard issue-fix PR and does not replace the merge-arbiter verdict, because migration-specific QA/build gate files were not produced.

## Proposed title

Migrate employee service from Spring Boot 3.5.0 / Java 17 to Spring Boot 4.1.1 / Java 21

## Summary

This change upgrades the platform baseline to Spring Boot 4.1.1 and Java 21. It migrates the application from Jackson 2 APIs to the Jackson 3 APIs used by Boot 4, updates the actuator health-contributor imports, moves Boot test slices to the modular test starters, replaces `@MockBean` with `@MockitoBean`, and restores Boot 4 security-test integration for `@WithMockUser` tests.

The recorded migration run reached a green Java 21 package build: 19 tests passed with 0 failures and 0 errors, matching the recorded Boot 3 baseline. All 15 recorded runtime probes preserved their expected HTTP statuses and authentication/application-owned error boundaries.

## Scope

- Spring Boot `3.5.0` to `4.1.1`.
- Java `17` to `21`, including Maven compiler release and the container runtime base image.
- Servlet starter rename to `spring-boot-starter-webmvc`.
- Boot 4 modular test starters for MVC and JPA.
- Boot security-test starter for MockMvc security-context integration.
- Jackson 3 mapper customization and date/inclusion configuration.
- Relocated actuator `Health` and `HealthIndicator` types.
- Test source updates for relocated slice annotations, Mockito integration, and `JsonMapper`.

The recorded migration report identifies seven changed files: `Dockerfile`, `pom.xml`, `JacksonConfig.java`, `DatabaseHealthIndicator.java`, `ActuatorEndpointsTest.java`, `EmployeeControllerTest.java`, and `EmployeeRepositoryIntegrationTest.java`.

## Evidence

- [Migration report](../04-remediation/migration_boot4-upgrade.md): six recorded build rounds, green final package build, dependency and source changes, and runtime probe comparison.
- [Approved migration plan](../04-remediation/migration_plan_spring-boot-3-to-4.md): target versions, predicted impact, rollout phases, rollback method, and probe scope.
- [Re-scan](../05-verify/rescan_boot4-upgrade.md): all eight Boot 3/Jackson 2 signatures absent from the patched artifact.
- [Red-team recon](../05-verify/redteam_boot4-upgrade.md): no alternate security, exception, or persistence bypass demonstrated; PostgreSQL and configuration semantics remain unproved.
- [Behavior guard](../05-verify/behavior_boot4-upgrade.md): endpoint statuses and application-owned responses preserved, but the framework-generated missing-parameter problem-details body lost `type=about:blank`.

## Review risks

1. **Problem-details contract change:** the missing-query-parameter `application/problem+json` response changed from five members to four and omitted `type=about:blank`. Strict clients or schema validators may depend on that member.
2. **Configuration drift:** `application.yml` and `application-test.yml` were not changed or audited with a properties migrator/binding report. A renamed Boot 3 property may be silently ignored.
3. **Database coverage:** the native SQL path was exercised through tests/H2 evidence, not a live PostgreSQL deployment.
4. **Runtime image coverage:** the Dockerfile change was inspected but the container image was not built as part of the verification reports.
5. **Scope/approval record:** the plan's At-a-glance table says `Approved`, while its decision section still says `Proposed` and leaves reviewer/date unset. The approval record should be normalized before release.

## Test and validation plan

- [x] Boot 3 / Java 17 baseline recorded as green: 19 tests, 0 failures, 0 errors.
- [x] Boot 4 / Java 21 final package run recorded as green: 19 tests, 0 failures, 0 errors.
- [x] 15 runtime probes compared for status and boundary behavior.
- [x] Eight original migration signatures removed from the patched artifact.
- [x] Security boundary checked for anonymous, invalid-credential, valid Basic-authentication, and mock-user paths.
- [ ] Run the migration-specific QA gate and build gate using the current migration artifact.
- [ ] Build and start the Docker image on Java 21.
- [ ] Replay the native query against PostgreSQL.
- [ ] Audit Boot 4 property binding and ignored/renamed configuration keys.
- [ ] Add a contract test deciding whether `problem+json.type` is required for missing parameters.
- [ ] Normalize the migration plan's reviewer, decision date, and status fields.

## Release recommendation

Treat this as a **conditional migration review**, not a fully cleared standard PR. The recorded build and runtime evidence are strong for the exercised paths, but the behavior guard identified an unapproved response-schema change and the red-team report leaves PostgreSQL and configuration behavior uncertain. Resolve or explicitly accept those items before merging the migration into a release branch.
