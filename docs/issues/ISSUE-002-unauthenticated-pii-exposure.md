---
issue_id: ISSUE-002
title: Employee PII and payroll data are exposed to unauthenticated callers and written to application logs
type: Vulnerability
severity: Critical
status: Open
reported_on: 2026-08-09
reported_by: Security review - sensitive data exposure and access control
affected_services:
  - employee-service
  - report-service
  - sheduler-service
  - department-service
  - configuaration-server
  - discovery-service
affected_symbols:
  - EmployeeSchedulerController.getAllEmployees
  - EmployeeReportController.exportToExcel
  - EmployeeReportServiceImpl.getEmployees
  - EmployeeController.getEmployee
  - EmployeeController.createEmployee
  - EmployeeController.searchEmployees
  - DepartmentController.getAllDepartments
affected_files:
  - sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/controller/EmployeeSchedulerController.java
  - report-service/src/main/java/com/aura/vihanga/reportservice/controller/EmployeeReportController.java
  - report-service/src/main/java/com/aura/vihanga/reportservice/service/implementation/EmployeeReportServiceImpl.java
  - employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java
  - employee-service/src/main/resources/application.properties
  - department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java
entry_points:
  - GET /api/v1/employee
  - GET /api/v1/employee/{id}
  - GET /api/v1/employee/search
  - POST /api/v1/employee
  - GET /api/v1/export
  - GET /api/v1/department/salary/{minSalary}
---

# ISSUE-003 — Employee PII and payroll data are exposed to unauthenticated callers and written to application logs

## Summary

The workforce dataset held by this platform — full name, home address, phone number, gender,
employment type and departmental salary — is reachable by **any caller who can open a TCP connection
to a service port**. No module in the workspace declares an authentication or authorisation
mechanism of any kind, and the same data is additionally written in clear text into the application
logs of three services.

There are two independent exposure channels, and both are live in the default configuration:

1. **Channel A — the REST surface.** Every endpoint is anonymous. There is no login, no token, no
   API key, no network-level allow-list expressed in the code.
2. **Channel B — the log files.** Personal data and salary figures are passed as SLF4J arguments and
   land in whatever log sink the container is configured with.

Relevant CWEs: **CWE-306** (Missing Authentication for Critical Function), **CWE-862** (Missing
Authorization), **CWE-359** (Exposure of Private Personal Information), **CWE-532** (Insertion of
Sensitive Information into Log File). OWASP **A01:2021 Broken Access Control** and
**A09:2021 Security Logging and Monitoring Failures**.

## Affected Area

### Channel A — unauthenticated REST endpoints

| #   | Service              | Endpoint                                    | Handler                                                                                                                                                      | Sensitive data returned                                                                                  |
| --- | -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | `sheduler-service`   | `GET /api/v1/employee`                      | [EmployeeSchedulerController.java:19](../../sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/controller/EmployeeSchedulerController.java#L19) | **Every** employee record, returned as the raw `Employee` entity — name, address, phone, gender          |
| 2   | `report-service`     | `GET /api/v1/export`                        | [EmployeeReportController.java:26](../../report-service/src/main/java/com/aura/vihanga/reportservice/controller/EmployeeReportController.java#L26)           | **Every** employee's name and **salary**, as a downloadable XLSX                                         |
| 3   | `employee-service`   | `GET /api/v1/employee/{id}`                 | [EmployeeController.java:62](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L62)                   | One employee's full PII                                                                                  |
| 4   | `employee-service`   | `GET /api/v1/employee/search`               | [EmployeeController.java:51](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L51)                   | Arbitrary subsets of employee PII (see also [ISSUE-004](./ISSUE-004-nosql-injection-employee-search.md)) |
| 5   | `employee-service`   | `POST /api/v1/employee`                     | [EmployeeController.java:32](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L32)                   | **Write** access — anonymous callers can create records                                                  |
| 6   | `employee-service`   | `POST /api/v1/employee/excelUpload`         | [EmployeeController.java:42](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L42)                   | **Bulk write** access — anonymous callers can `saveAll()` into the collection                            |
| 7   | `department-service` | `GET /api/v1/department/salary/{minSalary}` | [DepartmentController.java:40](../../department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java#L40)           | Salary band for every department                                                                         |

The two infrastructure services are equally open:

| Service                           | Surface                         | Consequence                                                                                                                                         |
| --------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configuaration-server` (`:8504`) | `GET /{application}/{profile}`  | Serves the **entire Spring Cloud Config store**, including datasource URIs and credentials, to any unauthenticated caller                           |
| `discovery-service` (`:8761`)     | Eureka dashboard + registry API | Full service inventory disclosure; an attacker can also register a **rogue instance** under an existing service name and intercept internal traffic |

### Channel B — sensitive data written to logs

| #   | Service              | Call site                                                                                                                                                        | Level    | What is logged                                                                            |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| 1   | `report-service`     | [EmployeeReportServiceImpl.java:63](../../report-service/src/main/java/com/aura/vihanga/reportservice/service/implementation/EmployeeReportServiceImpl.java#L63) | **INFO** | `employeeId`, `name` and **`salary`**, once per employee, on every export                 |
| 2   | `department-service` | [DepartmentController.java:42](../../department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java#L42)               | **INFO** | Every department with its salary figure                                                   |
| 3   | `employee-service`   | [EmployeeController.java:33](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L33)                       | TRACE    | The whole `Employee` object; Lombok `@Data` `toString()` includes `phoneNo` and `address` |

Call sites 1 and 2 log at **INFO**, so they are active under any normal production log configuration
— no debug flag is required. Call site 3 requires TRACE, and TRACE **is explicitly switched on** in
the committed configuration:

```properties
# employee-service/src/main/resources/application.properties:1
logging.level.com.aura.vihanga.employeeservice.controller = trace
```

## Observed Behavior

- No module declares `spring-boot-starter-security`. A search across all six `pom.xml` files for
  `spring-boot-starter-security` returns zero matches.
- No `SecurityFilterChain`, `WebSecurityConfigurerAdapter`, `@PreAuthorize`, `@Secured` or
  `@RolesAllowed` exists anywhere in `src/main/java`.
- Consequently Spring Boot applies no filter chain, and every `@RequestMapping` handler is dispatched
  for anonymous requests. No handler performs its own identity or entitlement check.
- Requests carry no correlation to any principal, so there is **no audit trail**: it is not possible
  to determine after the fact who read or modified an employee record.
- `GET /api/v1/employee` serialises the persistence entity directly rather than a DTO, so every
  persisted field is emitted whether or not the caller needs it.
- Salary values reach the log sink at INFO on the normal export path. Log files are commonly shipped
  to aggregation platforms and retained far longer, and with broader read access, than the database
  itself.

## Expected Behavior

- Every endpoint that reads or writes employee or salary data must require an authenticated
  principal, and must authorise that principal against the specific record or dataset requested.
  Only explicitly designated health/readiness endpoints may remain anonymous.
- Payroll data (`GET /api/v1/export`, `GET /api/v1/department/salary/{minSalary}`) must be restricted
  to a dedicated privileged role; it should not be readable by an ordinary authenticated user.
- Service-to-service calls (`employee-service` → `department-service`,
  `report-service` → `department-service`) must carry a service credential rather than relying on
  network position.
- The config server must require authentication and encrypt secrets at rest
  (`{cipher}`), and Eureka must require credentials for registration and for the dashboard.
- Responses must be projected into purpose-built DTOs. `GET /api/v1/employee` must not return the
  `Employee` entity.
- PII and salary values must never be passed to a logger. Log identifiers (`employeeId`) only, and
  mask or omit `phoneNo`, `address` and `salary`.
- Access to employee records must produce an audit event carrying the acting principal.

## Steps to Reproduce

1. Start `configuaration-server`, `discovery-service`, `department-service`, `employee-service`,
   `report-service` and `sheduler-service`. (Ports come from the config server; defaults are
   `department-service` `8501`, `report-service` `8502`, `sheduler-service` `8503`,
   `configuaration-server` `8504`, `discovery-service` `8761`.)
2. Seed the `employee` collection with a handful of records.
3. From a machine with **no credentials of any kind**, pull the entire workforce:
   ```bash
   curl -s http://localhost:8503/api/v1/employee | jq '.[0]'
   ```
   Observe `name`, `address`, `phoneNo` and `gender` in the response.
4. Download every employee's salary as a spreadsheet:
   ```bash
   curl -s -o payroll.xlsx http://localhost:8502/api/v1/export
   ```
   Open `payroll.xlsx` — it contains one row per employee including the `Salary` column.
5. Write to the database anonymously:
   ```bash
   curl -i -X POST http://localhost:8500/api/v1/employee \
        -H "Content-Type: application/json" \
        -d '{"employeeId":"EMP-INJECTED","name":"Anonymous","department":"DEP01",
             "phoneNo":"0000000000","address":"n/a","gender":"MALE","employeeType":"PERMANENT"}'
   ```
   The record is persisted and returns `201 CREATED`.
6. Retrieve the config store, credentials included:
   ```bash
   curl -s http://localhost:8504/employee/default
   ```
7. Inspect the `report-service` console or log file after step 4 — every employee's salary is
   present in plain text at INFO level.

**Reproducibility:** 100% — deterministic on every request, in every environment, with no
preconditions.

## Impact

- **Confidentiality (Critical):** The complete HR dataset — names, home addresses, phone numbers,
  gender and salaries — is downloadable by anyone with network reach, in two convenient bulk formats
  (JSON and XLSX). This is directly regulated personal data; under GDPR/PDPA-style regimes an
  incident of this shape is a reportable personal-data breach, and salary data typically attracts
  additional contractual and works-council obligations.
- **Integrity (Critical):** `POST /api/v1/employee` and `POST /api/v1/employee/excelUpload` are
  anonymous **write** paths. Because the client supplies `employeeId`, which is the Mongo `@Id`,
  `save()`/`saveAll()` behave as upserts — an unauthenticated caller can overwrite an existing
  employee's department, address or phone number, not merely append new records.
- **Lateral movement:** The open config server discloses the datasource URI and credentials for the
  shared MongoDB instance, converting an application-layer exposure into direct database access.
  The open Eureka registry allows a rogue instance to be registered under a legitimate service name,
  placing an attacker in the path of internal service-to-service traffic.
- **Non-repudiation:** With no principal on any request, there is no way to attribute a read or a
  write. A breach could not be scoped after the fact — it would be impossible to state which records
  were accessed or by whom.
- **Secondary exposure via logs:** Even after the REST surface is closed, salary and PII persist in
  log aggregation systems, which usually have a wider audience (support, SRE, third-party vendors)
  and a longer retention period than the production database.
- **Compounding factors:** [ISSUE-002](./ISSUE-002-unbounded-findall-usage.md) means the bulk
  endpoints return the _entire_ collection in one call, and
  [ISSUE-004](./ISSUE-004-nosql-injection-employee-search.md) gives an attacker a filtering primitive
  over the same unauthenticated surface.

## Detection Notes

- `git grep -l "spring-boot-starter-security" -- '*.xml'` → no matches in any of the six modules.
- `git grep -nE "SecurityFilterChain|WebSecurityConfigurerAdapter|@PreAuthorize|@Secured|@RolesAllowed" -- '*.java'`
  → no matches.
- `git grep -nE "@Valid|javax.validation" -- '*.java' 'src/main/**'` → no matches; there is no input
  validation layer either.
- All 10 handlers in the REST surface documented in [architecture.md](../architecture.md) are
  reachable without credentials.
- Grep for logger calls carrying whole objects:
  `git grep -nE "log\.(info|trace|debug)\(.*\{\}.*(employee|Employee|Salary|department)" -- '*.java'`
- `logging.level.…controller = trace` is the only uncommented logging directive in the workspace and
  is committed, so TRACE-level PII logging is the default for `employee-service`.
