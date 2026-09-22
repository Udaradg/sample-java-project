## JIRA-001 — Add pagination, sorting and filtering to the employee listing endpoint

| Field | Value |
|---|---|
| **Status** | Compiled |
| **Plan** | [JIRA-001](../02-story-analysis/plan_JIRA-001.md) |
| **Diff** | [docs/agent_output/03-development/dev_JIRA-001.diff](../../../docs/agent_output/03-development/dev_JIRA-001.diff) |

## Summary

GET /api/v1/employees now returns a PageResponse<EmployeeResponse> envelope built from Pageable + an optional Specification filter, instead of a bare List<EmployeeResponse>. EmployeeController parses page/size/sort query params (size clamped to 100, sort validated against a whitelist of six Employee fields and asc/desc, throwing IllegalArgumentException on a bad value), and passes department/active straight through. EmployeeService.getAllEmployees(Pageable, department, active) builds a Specification<Employee> that adds a department-equals and/or active-equals predicate only when the corresponding param is supplied, then calls the new EmployeeRepository.findAll(Specification, Pageable) via JpaSpecificationExecutor<Employee>. GlobalExceptionHandler gained a handleIllegalArgument(...) mapping IllegalArgumentException to 400 with the existing ErrorResponse shape. A new PageResponse<T> DTO (content, page, size, totalElements, totalPages) was added. /search and /high-earners endpoints and their service methods are untouched.

## Acceptance criteria addressed

- ✅ **GET /api/v1/employees accepts optional page (default 0) and size (default 20, capped at 100 -- clamped, not rejected)** — EmployeeController.getAllEmployees declares @RequestParam(defaultValue = "0") page and @RequestParam(defaultValue = "20") size; buildPageable() clamps size via Math.min(size, MAX_PAGE_SIZE) (100) before constructing the PageRequest, so an oversized value is clamped rather than rejected.
- ✅ **optional sort=field,direction restricted to real Employee fields, unknown field/direction returns 400 not 500** — buildPageable() splits sort on the comma, checks the field against SORTABLE_FIELDS (firstName, lastName, email, department, salary, createdAt) and the direction via Sort.Direction.fromString, throwing IllegalArgumentException on any mismatch before a Sort/Pageable is ever built. GlobalExceptionHandler.handleIllegalArgument maps that exception to 400 using the existing ErrorResponse shape, ahead of the generic 500 handler.
- ✅ **optional department and active query params filter when present, ignored when absent** — EmployeeService.buildFilterSpecification adds a department-equals predicate only if department != null and an active-equals predicate only if active != null; with both absent it returns criteriaBuilder.and() over an empty predicate list, i.e. a no-op filter. EmployeeRepository now extends JpaSpecificationExecutor<Employee> to support findAll(Specification, Pageable).
- ✅ **response body becomes a page envelope with content/page/size/totalElements/totalPages** — New PageResponse<T> DTO carries exactly those five fields. EmployeeService.getAllEmployees(Pageable, String, Boolean) maps the Page<Employee> result's content through EmployeeMapper.toResponse and wraps it, and EmployeeController.getAllEmployees returns ResponseEntity<PageResponse<EmployeeResponse>>.
- ✅ **no query params still returns HTTP 200 with the first default-size page** — With all params absent, buildPageable() falls through to PageRequest.of(0, 20) (defaults, no sort) and buildFilterSpecification() returns a no-op specification, so the same code path used for filtered/sorted calls returns 200 with the first default-size page.
- ✅ **/api/v1/employees/search and /api/v1/employees/high-earners are unchanged** — EmployeeController.searchByDepartment/getHighEarners and EmployeeService.searchByDepartment/findHighEarners were not touched by this diff; only getAllEmployees (controller + service), EmployeeRepository's declared interfaces, GlobalExceptionHandler, and the new PageResponse DTO changed.

## Follow-ups

- EmployeeControllerTest.testGetAllEmployees_Success/_WithBasicAuth stub no employeeService.getAllEmployees(...) behavior and don't assert the new envelope shape yet -- per the plan's own risk note, the bare-array-to-page-envelope change will need those tests (and any other client of GET /api/v1/employees) updated; left untouched here since test changes are out of this story's affected-files scope.

## What changed

- [src/main/java/com/example/migrationdemo/controller/EmployeeController.java](../../../src/main/java/com/example/migrationdemo/controller/EmployeeController.java)
- [src/main/java/com/example/migrationdemo/dto/PageResponse.java](../../../src/main/java/com/example/migrationdemo/dto/PageResponse.java)
- [src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java](../../../src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java)
- [src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java](../../../src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java)
- [src/main/java/com/example/migrationdemo/service/EmployeeService.java](../../../src/main/java/com/example/migrationdemo/service/EmployeeService.java)

## Build output

```
$ mvn -q compile (exit 0)

$ mvn -q test-compile (exit 0)

```
