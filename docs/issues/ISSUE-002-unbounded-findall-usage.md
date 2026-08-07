---
issue_id: ISSUE-002
title: Unbounded repository findAll() reads whole collections into memory across multiple services
type: Vulnerability
severity: High
status: Open
reported_on: 2026-08-06
reported_by: Architecture review - performance and availability
affected_services:
  - sheduler-service
  - report-service
affected_symbols:
  - EmployeeSchedulerServiceImpl.getAllEmployees
  - EmployeeReportServiceImpl.getEmployees
  - WomenDaySchedulerImpl.printWomenDayMessage
  - EmployeeSchedulerController.getAllEmployees
  - EmployeeReportController.exportToExcel
affected_files:
  - sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/service/implementation/EmployeeSchedulerServiceImpl.java
  - report-service/src/main/java/com/aura/vihanga/reportservice/service/implementation/EmployeeReportServiceImpl.java
entry_points:
  - GET /api/v1/employee
  - GET /api/v1/export
---

# ISSUE-002 — Unbounded repository `findAll()` reads whole collections into memory across multiple services

## Summary

Multiple backend services load an entire MongoDB collection into the JVM heap with a bare
`findAll()` call — no pagination, no query filter, no field projection and no result cap. The
volume of data returned is decided entirely by how large the collection has grown, not by what the
caller actually needs. Two of these call sites sit directly behind public REST endpoints, so a
single request can force a service to materialise every employee document at once.

## Affected Call Sites

| # | Service | Call site | Repository call | Reached from |
|---|---|---|---|---|
| 1 | `sheduler-service` | [EmployeeSchedulerServiceImpl.java:18](../../sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/service/implementation/EmployeeSchedulerServiceImpl.java#L18) | `employeeSchedulerRepository.findAll()` | `GET /api/v1/employee` (public) and the Women's Day cron job |
| 2 | `report-service` | [EmployeeReportServiceImpl.java:40](../../report-service/src/main/java/com/aura/vihanga/reportservice/service/implementation/EmployeeReportServiceImpl.java#L40) | `employeeReportRepository.findAll()` | `GET /api/v1/export` (public) |

Both repositories extend `MongoRepository`, so `findAll()` issues an unfiltered collection scan and
returns a fully materialised `List` before any application code runs.

## Observed Behavior

**Call site 1 — `sheduler-service`**

- `GET /api/v1/employee` returns every employee document in the collection, serialised in full, with
  no page size, no limit parameter and no filtering. The entity is returned directly, so every
  persisted field is exposed to the caller.
- The scheduled job `WomenDaySchedulerImpl.printWomenDayMessage()` calls the same method and then
  filters for `GenderType.FEMALE` **in Java**, after the entire collection has already been
  transferred and mapped. The filter is never pushed down to the database.

**Call site 2 — `report-service`**

- `GET /api/v1/export` loads every employee via `findAll()`, then performs an outbound HTTP call to
  `department-service` for the department list, and then joins the two lists with a nested
  `for` loop (employees × departments) purely in memory.
- The complete joined result and the generated XLSX workbook are both held in the heap at the same
  time, and the workbook is buffered into a `ByteArrayOutputStream` before a single byte is written
  to the response.

## Expected Behavior

- Read operations that back a REST endpoint should return a bounded result set — paginated
  (`Pageable`/`Page`), or explicitly limited, with the page size controlled by the API contract
  rather than by collection size.
- Filtering criteria that are known ahead of time (for example gender for the Women's Day job)
  should be expressed as a derived query or `@Query` so the database returns only matching
  documents.
- Bulk exports should stream or process in chunks so that heap usage stays flat and independent of
  how many records exist.
- Responses should be projected into DTOs rather than returning persistence entities as-is.

## Steps to Reproduce

1. Start `configuaration-server`, `discovery-service`, `department-service`, `sheduler-service` and
   `report-service`. (Ports are supplied by the config server; `sheduler-service` defaults to
   `8503` and `report-service` to `8502`.)
2. Seed the `employee` collection with a realistic production volume (for example 500,000
   documents).
3. Call the scheduler endpoint and observe response size, latency and heap usage:
   ```bash
   curl -s -o /dev/null -w "%{size_download} bytes in %{time_total}s\n" \
        http://localhost:8503/api/v1/employee
   ```
4. Call the export endpoint and watch the JVM heap while it runs:
   ```bash
   curl -s -o employees.xlsx http://localhost:8502/api/v1/export
   ```
5. Repeat step 3 or 4 concurrently from a handful of clients. Response times degrade sharply, GC
   activity rises, and the service becomes unresponsive or terminates with `OutOfMemoryError`
   once the collection is large enough.

**Reproducibility:** Deterministic. Severity scales with collection size — the endpoints appear
healthy on a small development dataset and degrade as data grows.

## Impact

- **Availability:** Heap consumption is proportional to collection size and to the number of
  concurrent callers. A handful of simultaneous requests to `GET /api/v1/employee` or
  `GET /api/v1/export` is enough to exhaust the heap and take down the instance — an unauthenticated
  caller can trigger this repeatedly.
- **Performance:** Full collection scans on every call add sustained load to the shared MongoDB
  instance, degrading unrelated services that use the same database. The in-memory nested-loop join
  in `report-service` compounds the cost as both datasets grow.
- **Data exposure:** `GET /api/v1/employee` serialises the `Employee` entity directly, so the whole
  workforce dataset — including fields that no client asked for, such as address and phone number —
  is returned in one unpaginated response.
- **Scalability:** The pattern is repeated across services, so the same failure mode must be fixed
  in more than one place and is likely to be copied into new services.

## Detection Notes

- Grep for `findAll(` across `src/main/java` returns exactly the two call sites listed above.
- Neither call site passes a `Pageable`, `Sort`, `Limit`, or query argument.
- No endpoint in the REST surface documented in [architecture.md](../architecture.md) accepts a
  `page` or `size` parameter.
