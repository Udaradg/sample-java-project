# Architecture briefing — boot4-upgrade

Read live from the Neo4j code knowledge graph at `neo4j+s://7d610372.databases.neo4j.io` (database `neo4j`) on 2026-09-10 11:02:10.

| | |
|---|---|
| **Modules** | 1 |
| **Types** | 17 |
| **Declared dependencies** | 12 |
| **Framework touchpoints** | 5 external base types, held by 6 type(s) |
| **REST endpoints** | 7 |
| **Critical/high areas** | 20 |

## 1. Where this application touches the framework

These are the types that extend or implement something defined outside this repository. In a framework-generation jump they are where the compiler fails first — a relocated package or a changed signature lands here before it lands anywhere else.

| External type | Relation | Types | Files |
|---|---|---|---|
| `RuntimeException` | EXTENDS | 2 | `src/main/java/com/example/migrationdemo/exception/EmployeeNotFoundException.java`<br>`src/main/java/com/example/migrationdemo/exception/DuplicateEmployeeException.java` |
| `CommandLineRunner` | IMPLEMENTS | 1 | `src/main/java/com/example/migrationdemo/init/DataInitializer.java` |
| `HealthIndicator` | IMPLEMENTS | 1 | `src/main/java/com/example/migrationdemo/health/DatabaseHealthIndicator.java` |
| `JpaRepository` | EXTENDS | 1 | `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` |
| `ResponseEntityExceptionHandler` | EXTENDS | 1 | `src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java` |

## 2. How it is wired

Annotations name the framework contract each type is bound by. A generation jump renames, relocates or retires some of them — check every one of these against the reference pack.

| Annotation | Types | Files |
|---|---|---|
| `@Component` | 3 | `src/main/java/com/example/migrationdemo/init/DataInitializer.java`, `src/main/java/com/example/migrationdemo/health/DatabaseHealthIndicator.java`, `src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java` |
| `@Configuration` | 2 | `src/main/java/com/example/migrationdemo/config/SecurityConfig.java`, `src/main/java/com/example/migrationdemo/config/JacksonConfig.java` |
| `@EnableWebSecurity` | 1 | `src/main/java/com/example/migrationdemo/config/SecurityConfig.java` |
| `@Entity` | 1 | `src/main/java/com/example/migrationdemo/entity/Employee.java` |
| `@Repository` | 1 | `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` |
| `@RequestMapping` | 1 | `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` |
| `@RestController` | 1 | `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` |
| `@RestControllerAdvice` | 1 | `src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java` |
| `@Service` | 1 | `src/main/java/com/example/migrationdemo/service/EmployeeService.java` |
| `@SpringBootApplication` | 1 | `src/main/java/com/example/migrationdemo/MigrationDemoApplication.java` |
| `@Table` | 1 | `src/main/java/com/example/migrationdemo/entity/Employee.java` |

## 3. Files ranked by exposure

Exposure combines framework coupling (external base types, annotations, exposed endpoints) with reach (how many types depend on this one, and how critical the graph says it is). It ranks where to look; it does not predict that a file will change.

| Rank | File | Exposure | Framework coupling | Dependents | Criticality |
|---|---|---|---|---|---|
| 1 | `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` | 16 | @RequestMapping, @RestController | 0 | — |
| 2 | `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` | 12 | extends JpaRepository, @Repository | 2 | high |
| 3 | `src/main/java/com/example/migrationdemo/service/EmployeeService.java` | 9 | @Service | 1 | critical |
| 4 | `src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java` | 5 | @Component | 1 | medium |
| 5 | `src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java` | 4 | extends ResponseEntityExceptionHandler, @RestControllerAdvice | 0 | — |
| 6 | `src/main/java/com/example/migrationdemo/health/DatabaseHealthIndicator.java` | 4 | implements HealthIndicator, @Component | 0 | — |
| 7 | `src/main/java/com/example/migrationdemo/init/DataInitializer.java` | 4 | implements CommandLineRunner, @Component | 0 | — |
| 8 | `src/main/java/com/example/migrationdemo/exception/DuplicateEmployeeException.java` | 3 | extends RuntimeException | 0 | — |
| 9 | `src/main/java/com/example/migrationdemo/exception/EmployeeNotFoundException.java` | 3 | extends RuntimeException | 0 | — |
| 10 | `src/main/java/com/example/migrationdemo/config/SecurityConfig.java` | 2 | @Configuration, @EnableWebSecurity | 0 | — |
| 11 | `src/main/java/com/example/migrationdemo/entity/Employee.java` | 2 | @Entity, @Table | 0 | — |
| 12 | `src/main/java/com/example/migrationdemo/config/JacksonConfig.java` | 1 | @Configuration | 0 | — |
| 13 | `src/main/java/com/example/migrationdemo/MigrationDemoApplication.java` | 1 | @SpringBootApplication | 0 | — |

## 4. The contract that must survive

Every REST endpoint in the graph. The migration must leave each of these answering exactly as it does today — these rows are the source of the runtime probe list.

| Method | Path | Controller | Criticality | What it is for |
|---|---|---|---|---|
| `GET` | `/api/v1/employees` | EmployeeController | medium | Returns every employee in the table as a flat JSON array. There is no paging, filtering or sorting of any kind -- the handler calls findAll and maps the whole result -- so the response size grows without bound with the table. |
| `POST` | `/api/v1/employees` | EmployeeController | high | Creates an employee from a fully specified payload and returns 201 with the persisted record, including the server-assigned id and audit timestamps. This is the only way a new employee enters the system through the API, and the only endpoint that enforces both uniqueness rules. |
| `GET` | `/api/v1/employees/high-earners` | EmployeeController | medium | Lists active employees earning strictly more than a required `salary` threshold, sorted highest first. It is the only endpoint backed by a native SQL query rather than JPA, and the only read path that filters on active, which makes its results inconsistent with the /search endpoint by design. |
| `GET` | `/api/v1/employees/search` | EmployeeController | medium | Finds employees by department name, case-insensitively, via a required `department` query parameter. Despite the generic /search path it searches exactly one field, and unlike the repository's other department query it does not filter out inactive employees. |
| `DELETE` | `/api/v1/employees/{id}` | EmployeeController | high | Permanently removes an employee row and returns 204 with no body. This is a hard delete, not a soft one -- notably, the entity carries an `active` flag that would support deactivation, but this endpoint does not use it, so the record and its history are gone. |
| `GET` | `/api/v1/employees/{id}` | EmployeeController | medium | Fetches one employee by surrogate database id -- not by employeeNumber, which is the business key a caller is more likely to hold. There is no lookup-by-employeeNumber endpoint anywhere in this API. |
| `PUT` | `/api/v1/employees/{id}` | EmployeeController | high | Updates an existing employee. Despite being a PUT it behaves as a partial update: every field on EmployeeUpdateRequest is optional and a null one is skipped, so the request body does not have to be a complete representation. employeeNumber cannot be changed through it at all. |

> Turn these into `probes.json` by adding what the graph cannot know: the credentials, an id that exists in the seed data, and the status each route is supposed to return. A probe with no `expect_status` proves only that something answered.

## 5. Where a regression would hurt most

| Node | Kind | Criticality | Role | How it fails |
|---|---|---|---|---|
| `EmployeeService` | Type | critical | service | The duplicate-EMAIL check is wrong in both write paths: createEmployee line 37 and updateEmployee line 68 both call findByEmployeeNumber(request.getEmail()), querying the employeeNumber column with an email value. It will effectively never match, so the intended 409 Conflict is not raised; the duplicate reaches the database, the unique constraint on email fires as DataIntegrityViolationException, and with no handler for that type the caller sees 500 'An unexpected error occurred' instead of 409; findActiveEmployeesByDepartment is not wired to any endpoint -- EmployeeController exposes no route for it, so the active-only filter is unreachable through the API and only exercised by tests |
| `SecurityConfig` | Type | critical | configuration | anyRequest().permitAll() (line 36) is the catch-all, so every path not under /api/** is anonymous. With spring.h2.console.enabled: true and path /h2-console (application.yml:20-23), the H2 console falls into that bucket and is not authentication-gated by this chain; CSRF is disabled globally (line 31), not just for /api/**, so it is also off for anything else the application serves |
| `updateEmployee` | Method | critical | service | Line 68 is the defect: the guard calls employeeRepository.findByEmployeeNumber(request.getEmail()), matching an email value against the employeeNumber column. It will not find the employee who actually holds that email, so the DuplicateEmployeeException at line 69 is effectively unreachable. The update proceeds, the database unique constraint on email rejects the save, DataIntegrityViolationException has no handler, and the caller receives 500 instead of 409; The same guard would produce a FALSE positive if an employeeNumber and an email string ever coincided -- a legitimate update would then be rejected as a duplicate email |
| `DELETE /api/v1/employees/{id}` | Endpoint | high | controller | Not idempotent: deleting the same id twice returns 204 then 404, because the service loads the entity first specifically to raise EmployeeNotFoundException. A client retrying after a timeout sees a spurious failure; Hard delete with no soft-delete alternative and no audit trail -- the data is unrecoverable through the API. The active flag exists on the entity but nothing in the REST surface exposes deactivation |
| `DatabaseHealthIndicator` | Type | high | configuration | The fall-through at line 33 returns Health.unknown() when the connection is non-null but reports itself closed. UNKNOWN is not DOWN, so the aggregate status does not go down and a probe watching for DOWN will not fire -- a genuinely unusable datasource can present as a non-failing health check; withException(e) (line 30) puts the exception into the health detail, and because management.endpoint.health.show-details is 'always' (application.yml:36-37) while /actuator/health is permitAll (SecurityConfig.java:33), that exception detail is served to unauthenticated callers -- typically including the JDBC URL, driver and failure reason |
| `Employee` | Type | high | entity | The unique constraints are the last line of defence and the only working one for email, since the service-level email check is broken; a violation surfaces as DataIntegrityViolationException from save() and reaches the caller as a 500; Because ddl-auto=update never drops or narrows, a change to a length or precision here may not be applied to an existing table, so the entity and the real schema can silently diverge |
| `EmployeeController` | Type | high | controller | The literal paths /search and /high-earners are declared after the /{id} template; Spring MVC prefers a literal segment over a path variable so they resolve correctly, but adding a further /{something} template could shadow them; Neither @RequestParam on searchByDepartment nor on getHighEarners declares required=false or a default, so omitting the parameter is a 400 from the framework before the handler body runs |
| `EmployeeRepository` | Type | high | repository | findHighEarners is nativeQuery = true against a table literally named employees; it bypasses JPA's dialect translation, so on the default H2 datasource it is PostgreSQL SQL running on a different engine and any dialect-specific construct fails at query time rather than at startup; The JPQL in findActiveEmployeesByDepartment is only parsed when the context builds, so a typo there is a startup failure, not a request failure -- a different symptom to triage than the native query |
| `GlobalExceptionHandler` | Type | high | exception | There is no handler for DataIntegrityViolationException, so a unique-constraint breach on email -- the exact failure the broken service-level email check lets through -- is caught by handleGenericException and returned as 500 with no indication that it was a duplicate. This is the mechanism that converts a should-be-409 into an opaque 500; handleGenericException swallows the cause entirely: nothing in this class logs the exception before replacing its message, so the only record of what actually failed is whatever Spring logs by default |
| `JpaRepository` | ExternalType | high | framework-base | Inherited methods invisible to this graph still perform real database round-trips: findById, findAll, save, delete and count; save() surfaces unique-constraint breaches as DataIntegrityViolationException, which no handler in this repo maps, so it lands on the generic 500 handler |
| `POST /api/v1/employees` | Endpoint | high | controller | A duplicate employeeNumber returns 409 as intended; A duplicate EMAIL does not return 409. The service-level check queries the wrong column, so the insert proceeds, the database unique constraint on email rejects it, and the caller receives 500 'An unexpected error occurred' (EmployeeService.java:36-39) |
| `PUT /api/v1/employees/{id}` | Endpoint | high | controller | The email conflict check is ineffective for the same reason as on create: it calls findByEmployeeNumber with the email value (EmployeeService.java:68), so updating an employee to another employee's email is not caught as 409 and instead fails at the database constraint and surfaces as 500; A caller cannot clear an optional field: sending null for department or salary is indistinguishable from omitting it and the old value is kept, while the response returns 200 suggesting the update was applied as sent |
| `com.example.migrationdemo.config` | Package | high | configuration | Both classes carry MIGRATION-DEMO comments marking them as expected breakage points for Spring Security 7 and Jackson 3, so this package is the most likely source of migration-time behavioural change |
| `com.example.migrationdemo.exception` | Package | high | exception | The catch-all @ExceptionHandler(Exception.class) flattens any exception without a more specific handler -- including database constraint violations -- to 500 with the fixed text 'An unexpected error occurred', discarding the real cause from the response; Both domain exceptions extend RuntimeException directly with no shared project superclass, so a newly added domain exception silently falls through to the generic 500 handler unless someone remembers to add an @ExceptionHandler for it |
| `createEmployee` | Method | high | controller | Adds no error handling; every failure below it, including the mis-detected duplicate email that becomes a 500, passes through unchanged to GlobalExceptionHandler |
| `deleteEmployee` | Method | high | controller | Not idempotent -- a repeat delete surfaces as 404 from the service, so a client retry after a network timeout reports failure for work that succeeded |
| `findByEmployeeNumber` | Method | high | repository | Both parameters and column are String-typed, so the compiler cannot catch a caller passing an email. Two of its four call sites do exactly that (EmployeeService.java:37 and :68), and the resulting empty Optional reads as 'no duplicate' -- the query works perfectly while the caller's intent is wrong. This method is not defective; it is the silent participant in the duplicate-email defect; There is no findByEmail counterpart on this interface, so no correct call was available to those two call sites |
| `spring-boot-migration-demo` | Module | high | deployable | The datasource defaults to a file-backed H2 database at ./data/employee_db (application.yml:6), so a deployment that forgets to set DB_URL silently runs on local disk instead of PostgreSQL and still reports healthy while holding no shared data; ddl-auto=update (application.yml:14) applies schema drift implicitly at boot; a removed column is not dropped and an incompatible type change can fail startup with a Hibernate schema error |
| `toResponse` | Method | high | mapper | A field added to Employee and EmployeeResponse but not wired in here is silently null in every API response, with no compile error if the constructor is positional and the types happen to line up; The positional ten-argument constructor is the real hazard: firstName/lastName/email/department are all String and adjacent, so a transposition compiles cleanly and swaps values in every response |
| `updateEmployee` | Method | high | controller | @Valid gives a false sense of coverage: an entirely empty JSON body {} passes validation and results in a 200 that changed nothing; Propagates the 500-instead-of-409 email conflict behaviour from the service unchanged |

## 6. Couplings with no code edge

No build round will ever surface these — a shared datastore or an external service does not appear in a compiler error. The plan has to carry them itself.

| Topic | What it is | Concerns | Confidence |
|---|---|---|---|
| shared-datastore | This service is the sole owner and sole writer of the employees table; there is no second application, batch job or migration tool writing it. Any inconsistency in employee data therefore originates in EmployeeService or DataInitializer, which narrows root-cause search considerably. | spring-boot-migration-demo, EmployeeService, DataInitializer, EmployeeRepository, Employee | high |
| known-risk | Both write paths check for a duplicate email by calling EmployeeRepository.findByEmployeeNumber(request.getEmail()) — an email value matched against the employeeNumber column (EmployeeService.java:37 and :68). The check therefore never fires, the database unique constraint on Employee.email becomes the only enforcement, and because no handler maps DataIntegrityViolationException the client sees 500 rather than the intended 409 Conflict. The repository has no findByEmail method at all, so no correct call was available. | spring-boot-migration-demo, EmployeeService, EmployeeRepository, Employee, GlobalExceptionHandler | high |
| config-coupling | Three settings combine into one externally visible behaviour that no single node shows: SecurityConfig permits /actuator/health anonymously, application.yml sets management.endpoint.health.show-details to always, and DatabaseHealthIndicator attaches the raw exception via withException(e) on failure. An unauthenticated caller therefore receives database product details when healthy and exception detail when not. | spring-boot-migration-demo, DatabaseHealthIndicator, SecurityConfig | high |
| config-coupling | spring.h2.console.enabled is true with path /h2-console, and SecurityConfig ends its rule chain with anyRequest().permitAll() while disabling CSRF globally. /h2-console is not under /api/**, so it falls into the permit-all bucket. Neither setting is profile-gated, so this applies wherever the application runs on H2 — which is the default when DB_URL is unset. | spring-boot-migration-demo, SecurityConfig | high |
| config-coupling | The datasource URL defaults to jdbc:h2:file:./data/employee_db when DB_URL is unset, yet the PostgreSQL driver is a dependency and EmployeeRepository.findHighEarners is native PostgreSQL SQL. An environment that forgets DB_URL starts cleanly, reports healthy, and serves from a local file — while the one native query is running engine-mismatched SQL. Nothing fails loudly. | spring-boot-migration-demo, EmployeeRepository, DatabaseHealthIndicator | high |
| deployment-order | There is no Flyway or Liquibase in this project; the employees schema is generated from the Employee entity by hibernate.ddl-auto=update at every boot. Schema change is therefore a side effect of deploying code, it never drops or narrows columns, and there is no versioned migration history to roll back to. | spring-boot-migration-demo, Employee | high |
| known-risk | DataInitializer is an unconditional @Component CommandLineRunner with no @Profile or property guard, so the five demo employees are seeded in any environment where the employees table is empty at startup — including production. Emptying the table via the API and restarting silently repopulates it. | spring-boot-migration-demo, DataInitializer | high |
| known-risk | SecurityConfig, JacksonConfig and both @Query methods on EmployeeRepository carry explicit MIGRATION-DEMO comments identifying them as planted Spring Boot 3 to 4 breakage points (Spring Security 6 to 7, Jackson 2 to 3, Hibernate query parsing). Treat findings in these four places as deliberate exercise material rather than accidental defects — unlike the duplicate-email defect, which carries no such marker. | spring-boot-migration-demo, EmployeeRepository, SecurityConfig, JacksonConfig | high |
| known-risk | Two code paths exist but cannot be reached through the REST surface: EmployeeService.findActiveEmployeesByDepartment (and the JPQL finder behind it) has no controller route, and EmployeeMapper.updateEntityFromRequest has no caller anywhere in src/ and takes an outbound EmployeeResponse where an EmployeeUpdateRequest would be expected. Both are covered only by tests or not at all, so a change to either produces no observable API effect. | spring-boot-migration-demo, EmployeeService, EmployeeRepository, EmployeeMapper | high |
| known-risk | Domain errors (404, 409) and the catch-all 500 render the project ErrorResponse shape, but framework-raised errors — wrong HTTP method, malformed JSON, missing @RequestParam, a non-numeric path variable or query parameter — are rendered by the inherited ResponseEntityExceptionHandler and do not use that shape. A client that parses one format will fail on the other, and the split does not follow status-code lines. | spring-boot-migration-demo, GlobalExceptionHandler, ErrorResponse, EmployeeController | medium |

## Appendix — how this was read

- Source: **Neo4j (live)**
- Connection details: `.github/skills/01c-graph-forge/.env` (credentials never printed)
- Project: `.` — 17 main / 6 test sources

| Query | Rows | Why it was asked |
|---|---|---|
| What the graph holds | 8 | Confirms the graph is real and current before anything is read out of it. |
| Modules | 1 | The units a version change is declared in — one build descriptor each. |
| Declared dependencies | 12 | Every coordinate whose version, name or module may move in the jump. |
| Framework touchpoints | 5 | Types extending or implementing something defined outside this repo. In a generation jump these break first — a moved package or a changed signature lands here before anywhere else. |
| Framework wiring by annotation | 11 | Annotations are the other coupling surface: they name the framework contract each type is wired by, and a generation jump renames, relocates or retires some of them. |
| REST surface | 7 | The contract the migration must preserve — and the source of the runtime probe list. |
| Change hotspots | 3 | Types the rest of the code leans on. A migration edit here reaches furthest, so these rank the blast radius of each predicted change. |
| Critical areas (semantic layer) | 20 | Where a regression would do the most damage, as judged when the graph was described. Drives what the behaviour probes must cover. |
| Cross-cutting facts | 10 | Couplings with no code edge — a shared datastore, an external service. Nothing in a build round will surface these, so the plan has to carry them. |
| Graph freshness | 7 | A description written for an older shape of the code is not evidence. Anything stale is reported as such rather than quietly used. |

