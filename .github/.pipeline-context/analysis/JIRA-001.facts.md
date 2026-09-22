# JIRA-001 — analysis briefing

## Story

**Add pagination, sorting and filtering to the employee listing endpoint**

`GET /api/v1/employees` currently returns the entire `employees` table in one response
(`EmployeeService.getAllEmployees()` calls `employeeRepository.findAll()` with no limit). As the
roster grows this endpoint gets slower, returns unbounded payloads to every caller, and gives API
consumers no way to page through, sort, or narrow the result set. We need real pagination, sorting,
and basic filtering so the endpoint stays fast and usable at scale.

## Acceptance Criteria

1. `GET /api/v1/employees` accepts optional query parameters `page` (0-based, default `0`) and `size` (default `20`, capped at `100` — a request for a larger size is clamped, not rejected).
2. `GET /api/v1/employees` accepts an optional `sort` query parameter in the form `field,direction` (e.g. `sort=lastName,asc`, `sort=salary,desc`), restricted to real `Employee` fields (`firstName`, `lastName`, `email`, `department`, `salary`, `createdAt`). An unknown field or direction returns `400 Bad Request` with the existing `ErrorResponse` shape (see `GlobalExceptionHandler`), not a 500.
3. `GET /api/v1/employees` accepts optional `department` and `active` query parameters that filter the result set when present, and are ignored (no filter applied) when absent.
4. The response body changes from a bare JSON array to a page envelope carrying `content` (the list of `EmployeeResponse`), `page`, `size`, `totalElements`, and `totalPages`.
5. Calling the endpoint with no query parameters at all still returns HTTP 200 with the first page (default size) rather than erroring — existing manual/API-doc examples keep working, just with a different response shape (see **Risks** below).
6. `/api/v1/employees/search` and `/api/v1/employees/high-earners` are unchanged by this story.

## Out of Scope

- Paginating `/search` or `/high-earners` (candidates for a follow-up story).
- Cursor-based (as opposed to offset-based) pagination.
- Changing the default page size based on caller identity or role.

## Related artifacts (keyword match — verify before relying on it)

- `class` EmployeeService — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.EmployeeService — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.createEmployee — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.getAllEmployees — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.getEmployeeById — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.updateEmployee — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.deleteEmployee — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.searchByDepartment — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.findActiveEmployeesByDepartment — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `method` EmployeeService.findHighEarners — src/main/java/com/example/migrationdemo/service/EmployeeService.java
- `class` EmployeeMapper — src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java
- `method` EmployeeMapper.toEntity — src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java
- `method` EmployeeMapper.toResponse — src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java
- `method` EmployeeMapper.updateEntityFromRequest — src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java
- `method` GlobalExceptionHandler.handleEmployeeNotFound — src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java
- `method` GlobalExceptionHandler.handleDuplicateEmployee — src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java
- `class` EmployeeNotFoundException — src/main/java/com/example/migrationdemo/exception/EmployeeNotFoundException.java
- `method` EmployeeNotFoundException.EmployeeNotFoundException — src/main/java/com/example/migrationdemo/exception/EmployeeNotFoundException.java
- `method` EmployeeNotFoundException.EmployeeNotFoundException — src/main/java/com/example/migrationdemo/exception/EmployeeNotFoundException.java
- `class` DuplicateEmployeeException — src/main/java/com/example/migrationdemo/exception/DuplicateEmployeeException.java
- `method` DuplicateEmployeeException.DuplicateEmployeeException — src/main/java/com/example/migrationdemo/exception/DuplicateEmployeeException.java
- `method` DuplicateEmployeeException.DuplicateEmployeeException — src/main/java/com/example/migrationdemo/exception/DuplicateEmployeeException.java
- `interface` EmployeeRepository — src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
- `method` EmployeeRepository.findByEmployeeNumber — src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
- `method` EmployeeRepository.findByDepartmentIgnoreCase — src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
- `method` EmployeeRepository.findActiveEmployeesByDepartment — src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
- `method` EmployeeRepository.findHighEarners — src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
- `class` Employee — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.Employee — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.Employee — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.onCreate — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.onUpdate — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getId — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setId — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getEmployeeNumber — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setEmployeeNumber — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getFirstName — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setFirstName — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getLastName — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setLastName — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getEmail — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setEmail — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getDepartment — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setDepartment — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getSalary — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setSalary — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getActive — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setActive — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getCreatedAt — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setCreatedAt — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.getUpdatedAt — src/main/java/com/example/migrationdemo/entity/Employee.java
- `method` Employee.setUpdatedAt — src/main/java/com/example/migrationdemo/entity/Employee.java
- `class` EmployeeUpdateRequest — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.EmployeeUpdateRequest — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.getFirstName — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.setFirstName — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.getLastName — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.setLastName — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.getEmail — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.setEmail — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.getDepartment — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.setDepartment — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.getSalary — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.setSalary — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.getActive — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `method` EmployeeUpdateRequest.setActive — src/main/java/com/example/migrationdemo/dto/EmployeeUpdateRequest.java
- `class` EmployeeResponse — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.EmployeeResponse — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.EmployeeResponse — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getId — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setId — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getEmployeeNumber — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setEmployeeNumber — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getFirstName — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setFirstName — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getLastName — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setLastName — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getEmail — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setEmail — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getDepartment — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setDepartment — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getSalary — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setSalary — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getActive — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setActive — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getCreatedAt — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setCreatedAt — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.getUpdatedAt — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `method` EmployeeResponse.setUpdatedAt — src/main/java/com/example/migrationdemo/dto/EmployeeResponse.java
- `class` EmployeeCreateRequest — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.EmployeeCreateRequest — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.EmployeeCreateRequest — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.getEmployeeNumber — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.setEmployeeNumber — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.getFirstName — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.setFirstName — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.getLastName — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.setLastName — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.getEmail — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.setEmail — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.getDepartment — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.setDepartment — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.getSalary — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `method` EmployeeCreateRequest.setSalary — src/main/java/com/example/migrationdemo/dto/EmployeeCreateRequest.java
- `class` EmployeeController — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `method` EmployeeController.EmployeeController — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` PostMapping EmployeeController.createEmployee — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` GetMapping EmployeeController.getAllEmployees — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` GetMapping EmployeeController.getEmployeeById — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` PutMapping EmployeeController.updateEmployee — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` DeleteMapping EmployeeController.deleteEmployee — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` GetMapping EmployeeController.searchByDepartment — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `endpoint` GetMapping EmployeeController.getHighEarners — src/main/java/com/example/migrationdemo/controller/EmployeeController.java
- `method` SecurityConfig.userDetailsService — src/main/java/com/example/migrationdemo/config/SecurityConfig.java

## Related context (Architect's semantic layer)

- (unnamed): (no summary)
- (unnamed): (no summary)
