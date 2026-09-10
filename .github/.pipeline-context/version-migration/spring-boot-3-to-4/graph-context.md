# Architecture briefing — spring-boot-3-to-4

Read live from the Neo4j code knowledge graph at `neo4j+s://7d610372.databases.neo4j.io` (database `neo4j`) on 2026-09-10 10:37:34.

| | |
|---|---|
| **Modules** | 1 |
| **Types** | 17 |
| **Declared dependencies** | 12 |
| **Framework touchpoints** | 5 external base types, held by 6 type(s) |
| **REST endpoints** | 7 |
| **Critical/high areas** | 0 |
| **Stale descriptions** | 1 — re-run 01b-context-weaver before trusting the semantic layer |

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
| 2 | `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` | 8 | extends JpaRepository, @Repository | 2 | — |
| 3 | `src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java` | 4 | extends ResponseEntityExceptionHandler, @RestControllerAdvice | 0 | — |
| 4 | `src/main/java/com/example/migrationdemo/health/DatabaseHealthIndicator.java` | 4 | implements HealthIndicator, @Component | 0 | — |
| 5 | `src/main/java/com/example/migrationdemo/init/DataInitializer.java` | 4 | implements CommandLineRunner, @Component | 0 | — |
| 6 | `src/main/java/com/example/migrationdemo/exception/DuplicateEmployeeException.java` | 3 | extends RuntimeException | 0 | — |
| 7 | `src/main/java/com/example/migrationdemo/exception/EmployeeNotFoundException.java` | 3 | extends RuntimeException | 0 | — |
| 8 | `src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java` | 3 | @Component | 1 | — |
| 9 | `src/main/java/com/example/migrationdemo/service/EmployeeService.java` | 3 | @Service | 1 | — |
| 10 | `src/main/java/com/example/migrationdemo/config/SecurityConfig.java` | 2 | @Configuration, @EnableWebSecurity | 0 | — |
| 11 | `src/main/java/com/example/migrationdemo/entity/Employee.java` | 2 | @Entity, @Table | 0 | — |
| 12 | `src/main/java/com/example/migrationdemo/config/JacksonConfig.java` | 1 | @Configuration | 0 | — |
| 13 | `src/main/java/com/example/migrationdemo/MigrationDemoApplication.java` | 1 | @SpringBootApplication | 0 | — |

## 4. The contract that must survive

Every REST endpoint in the graph. The migration must leave each of these answering exactly as it does today — these rows are the source of the runtime probe list.

| Method | Path | Controller | Criticality | What it is for |
|---|---|---|---|---|
| `GET` | `/api/v1/employees` | EmployeeController | — | — |
| `POST` | `/api/v1/employees` | EmployeeController | — | — |
| `GET` | `/api/v1/employees/high-earners` | EmployeeController | — | — |
| `GET` | `/api/v1/employees/search` | EmployeeController | — | — |
| `DELETE` | `/api/v1/employees/{id}` | EmployeeController | — | — |
| `GET` | `/api/v1/employees/{id}` | EmployeeController | — | — |
| `PUT` | `/api/v1/employees/{id}` | EmployeeController | — | — |

> Turn these into `probes.json` by adding what the graph cannot know: the credentials, an id that exists in the seed data, and the status each route is supposed to return. A probe with no `expect_status` proves only that something answered.

## 5. Where a regression would hurt most

_No semantic layer in the graph — run 01b-context-weaver to add criticality and failure modes._

## Appendix — how this was read

- Source: **Neo4j (live)**
- Connection details: `.github/skills/01c-graph-forge/.env` (credentials never printed)
- Project: `../spring-boot-3-to-4-migration-demo-master` — 17 main / 5 test sources

| Query | Rows | Why it was asked |
|---|---|---|
| What the graph holds | 8 | Confirms the graph is real and current before anything is read out of it. |
| Modules | 1 | The units a version change is declared in — one build descriptor each. |
| Declared dependencies | 12 | Every coordinate whose version, name or module may move in the jump. |
| Framework touchpoints | 5 | Types extending or implementing something defined outside this repo. In a generation jump these break first — a moved package or a changed signature lands here before anywhere else. |
| Framework wiring by annotation | 11 | Annotations are the other coupling surface: they name the framework contract each type is wired by, and a generation jump renames, relocates or retires some of them. |
| REST surface | 7 | The contract the migration must preserve — and the source of the runtime probe list. |
| Change hotspots | 3 | Types the rest of the code leans on. A migration edit here reaches furthest, so these rank the blast radius of each predicted change. |
| Critical areas (semantic layer) | 0 | Where a regression would do the most damage, as judged when the graph was described. Drives what the behaviour probes must cover. |
| Cross-cutting facts | 0 | Couplings with no code edge — a shared datastore, an external service. Nothing in a build round will surface these, so the plan has to carry them. |
| Graph freshness | 2 | A description written for an older shape of the code is not evidence. Anything stale is reported as such rather than quietly used. |

