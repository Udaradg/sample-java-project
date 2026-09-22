# JIRA-002 — analysis briefing

## Story

**Fix duplicate-email validation checking the wrong field**

`Employee.email` has a database-level `unique = true` constraint, and the API is supposed to reject
a duplicate email with a clean `409 Conflict` (`DuplicateEmployeeException`). It doesn't, because
the duplicate-email check queries the wrong repository method: it looks up the *email* value in the
*employee number* index instead of an email index. In practice this means the duplicate-email check
almost never matches anything, and a genuine duplicate email is instead rejected by the database
constraint, surfacing as an unhandled `DataIntegrityViolationException` (HTTP 500) instead of the
intended `409 Conflict`.

## Acceptance Criteria

1. `EmployeeRepository` exposes a `findByEmail(String email)` method (`Optional<Employee>`), analogous to the existing `findByEmployeeNumber`.
2. `EmployeeService.createEmployee(...)` checks the new `findByEmail(...)` — not `findByEmployeeNumber(...)` — when validating the email, and still throws `DuplicateEmployeeException("email", ...)` on a match, resulting in the existing `409 Conflict` response.
3. `EmployeeService.updateEmployee(...)` uses the same `findByEmail(...)` check when the request changes the email to one already used by a **different** employee, and does **not** false-positive when a caller submits the employee's own current email unchanged.
4. The existing employee-number duplicate check is untouched and keeps working as it does today.
5. Creating or updating an employee with a genuinely unique email still succeeds exactly as before (no regression).
6. A duplicate-email attempt is rejected with `409 Conflict` and the existing `ErrorResponse` body — it must never reach the database as a raw `DataIntegrityViolationException`.

## Out of Scope

- Case-insensitive email matching (email uniqueness stays case-sensitive, matching the current `@Email`/database column behavior).
- Adding a similar check anywhere outside `createEmployee`/`updateEmployee`.

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
