## JIRA-001 — Add pagination, sorting and filtering to the employee listing endpoint

| Field | Value |
|---|---|
| **Status** | Approved |
| **Story** | [JIRA-001](../00-jira-stories/jira-story-001.md) |
| **Type** | Story (Enhancement) |
| **Priority** | High |

> Flip **Status** to `Approved` (or `Rejected`) by hand to move this story forward.
> `03_developer` refuses to implement any plan not marked `Approved`.

## Approach

Replace EmployeeController.getAllEmployees()'s List<EmployeeResponse> return with a page envelope. The controller builds a PageRequest from page (default 0) and size (default 20, clamped to a max of 100), and parses an optional sort=field,direction parameter against a whitelist of the six real Employee fields (firstName, lastName, email, department, salary, createdAt); an unknown field or direction throws an IllegalArgumentException, caught by a new GlobalExceptionHandler handler that returns 400 with the existing ErrorResponse shape instead of falling through to the generic 500 handler. EmployeeRepository is extended with JpaSpecificationExecutor<Employee> (no new dependency -- already on the spring-data-jpa classpath) so EmployeeService.getAllEmployees(Pageable, ...) can call findAll(Specification, Pageable) with a Specification that adds a department-equals predicate only when department is supplied and an active-equals predicate only when active is supplied. A new PageResponse<T> DTO (content, page, size, totalElements, totalPages) is introduced; the controller maps the returned Page<Employee> through the existing EmployeeMapper.toResponse and wraps it in PageResponse.

## Affected files

- [src/main/java/com/example/migrationdemo/controller/EmployeeController.java](../../../src/main/java/com/example/migrationdemo/controller/EmployeeController.java)
- [src/main/java/com/example/migrationdemo/service/EmployeeService.java](../../../src/main/java/com/example/migrationdemo/service/EmployeeService.java)
- [src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java](../../../src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java)
- [src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java](../../../src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java)
- [src/main/java/com/example/migrationdemo/dto/PageResponse.java](../../../src/main/java/com/example/migrationdemo/dto/PageResponse.java)

## Affected symbols

- `EmployeeController.getAllEmployees`
- `EmployeeService.getAllEmployees`
- `EmployeeRepository`
- `GlobalExceptionHandler`

## Acceptance criteria plan

- **GET /api/v1/employees accepts optional page (default 0) and size (default 20, capped at 100 -- clamped, not rejected)**
  - Controller builds a PageRequest from page/size query params, defaulting each and clamping size to 100 before constructing the PageRequest.
- **optional sort=field,direction restricted to real Employee fields, unknown field/direction returns 400 not 500**
  - Controller parses sort against a whitelist of {firstName, lastName, email, department, salary, createdAt} plus {asc, desc}; a mismatch throws IllegalArgumentException, mapped by a new GlobalExceptionHandler.handleIllegalArgument(...) to 400 using the existing ErrorResponse shape.
- **optional department and active query params filter when present, ignored when absent**
  - EmployeeService.getAllEmployees(...) builds a Specification<Employee> that adds a department-equals predicate only if department is supplied and an active-equals predicate only if active is supplied; EmployeeRepository extends JpaSpecificationExecutor<Employee> to support findAll(Specification, Pageable).
- **response body becomes a page envelope with content/page/size/totalElements/totalPages**
  - Introduce PageResponse<EmployeeResponse> {content, page, size, totalElements, totalPages}; EmployeeController.getAllEmployees returns PageResponse<EmployeeResponse> built from the Page<Employee> result via EmployeeMapper.toResponse.
- **no query params still returns HTTP 200 with the first default-size page**
  - Default Pageable (page=0, size=20) and an empty/no-op Specification cover the no-params call through the same code path as filtered/sorted requests.
- **/api/v1/employees/search and /api/v1/employees/high-earners are unchanged**
  - No changes to EmployeeController.searchByDepartment, EmployeeController.getHighEarners, or EmployeeService.searchByDepartment/findHighEarners.

## Risks to watch

- Breaking response shape: GET /api/v1/employees changes from a bare JSON array to a page envelope, breaking any existing client or test (e.g. EmployeeControllerTest) that expects a bare array; there is no versioned API path to cushion this.
- The sort whitelist must be enforced before Spring Data builds a Sort from the raw string -- an unvalidated unknown property would surface as a PropertyReferenceException at query time and be caught only by the generic 500 handler, not the intended 400.
- Extending EmployeeRepository with JpaSpecificationExecutor<Employee> changes its declared interface; no new Maven dependency is required since spring-boot-starter-data-jpa already provides it.

## Test hints

- Unit test: an unknown sort field or direction returns 400 with the existing ErrorResponse shape via GlobalExceptionHandler.
- Unit test: department + active filters combine correctly against a mocked EmployeeRepository/Specification.
- Unit test: a size param above 100 is clamped rather than rejected.
- Controller test: calling the endpoint with no query params returns 200 with a page envelope (content/page/size/totalElements/totalPages).

## Open questions

- Confirm the breaking response-shape change for GET /api/v1/employees (bare array -> page envelope) is acceptable given there is no versioned API path today -- the story explicitly asks the analyst to confirm this before implementation starts.

## Story acceptance criteria (for reference)

1. `GET /api/v1/employees` accepts optional query parameters `page` (0-based, default `0`) and `size` (default `20`, capped at `100` — a request for a larger size is clamped, not rejected).
2. `GET /api/v1/employees` accepts an optional `sort` query parameter in the form `field,direction` (e.g. `sort=lastName,asc`, `sort=salary,desc`), restricted to real `Employee` fields (`firstName`, `lastName`, `email`, `department`, `salary`, `createdAt`). An unknown field or direction returns `400 Bad Request` with the existing `ErrorResponse` shape (see `GlobalExceptionHandler`), not a 500.
3. `GET /api/v1/employees` accepts optional `department` and `active` query parameters that filter the result set when present, and are ignored (no filter applied) when absent.
4. The response body changes from a bare JSON array to a page envelope carrying `content` (the list of `EmployeeResponse`), `page`, `size`, `totalElements`, and `totalPages`.
5. Calling the endpoint with no query parameters at all still returns HTTP 200 with the first page (default size) rather than erroring — existing manual/API-doc examples keep working, just with a different response shape (see **Risks** below).
6. `/api/v1/employees/search` and `/api/v1/employees/high-earners` are unchanged by this story.
