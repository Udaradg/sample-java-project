## JIRA-002 — Fix duplicate-email validation checking the wrong field

| Field | Value |
|---|---|
| **Status** | Proposed |
| **Story** | [JIRA-002](../00-jira-stories/jira-story-002.md) |
| **Type** | Bug |
| **Priority** | Critical |

> Flip **Status** to `Approved` (or `Rejected`) by hand to move this story forward.
> `03_developer` refuses to implement any plan not marked `Approved`.

## Approach

Add EmployeeRepository.findByEmail(String email) returning Optional<Employee>, analogous to the existing findByEmployeeNumber. In EmployeeService.createEmployee, replace the erroneous employeeRepository.findByEmployeeNumber(request.getEmail()) duplicate-email check with employeeRepository.findByEmail(request.getEmail()), keeping the existing DuplicateEmployeeException("email", ...) throw unchanged. In EmployeeService.updateEmployee, replace the same erroneous call inside the existing 'email actually changed' guard (request.getEmail() != null && !request.getEmail().equals(employee.getEmail())) with employeeRepository.findByEmail(request.getEmail()); that guard already prevents a false positive when a caller resubmits the employee's own current email unchanged. The employeeNumber duplicate checks in both methods are left untouched.

## Affected files

- [src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java](../../../src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java)
- [src/main/java/com/example/migrationdemo/service/EmployeeService.java](../../../src/main/java/com/example/migrationdemo/service/EmployeeService.java)

## Affected symbols

- `EmployeeRepository.findByEmployeeNumber`
- `EmployeeService.createEmployee`
- `EmployeeService.updateEmployee`

## Acceptance criteria plan

- **EmployeeRepository exposes a findByEmail(String email): Optional<Employee>, analogous to findByEmployeeNumber**
  - Add Optional<Employee> findByEmail(String email); to EmployeeRepository, a Spring Data derived query mirroring the existing findByEmployeeNumber declaration.
- **EmployeeService.createEmployee checks findByEmail(...) not findByEmployeeNumber(...), still throws DuplicateEmployeeException("email", ...) on a match**
  - Replace employeeRepository.findByEmployeeNumber(request.getEmail()) with employeeRepository.findByEmail(request.getEmail()) in the email duplicate check block of createEmployee; the throw new DuplicateEmployeeException("email", request.getEmail()) statement is unchanged.
- **EmployeeService.updateEmployee uses the same findByEmail(...) check when the email changes to one used by a different employee, no false positive on the employee's own unchanged email**
  - Replace employeeRepository.findByEmployeeNumber(request.getEmail()) with employeeRepository.findByEmail(request.getEmail()) inside the existing if (request.getEmail() != null && !request.getEmail().equals(employee.getEmail())) guard in updateEmployee; the guard itself is unchanged and already skips the lookup when the submitted email equals the current one.
- **the existing employee-number duplicate check is untouched**
  - No changes to the employeeRepository.findByEmployeeNumber(request.getEmployeeNumber()) call sites in createEmployee or updateEmployee.
- **creating/updating with a genuinely unique email still succeeds, no regression**
  - findByEmail(...) returning an empty Optional for a unique email falls through to employeeRepository.save(...) exactly as the (currently broken) check does today for non-matching input, so the success path is unchanged.
- **a duplicate-email attempt is rejected with 409 Conflict and the existing ErrorResponse body, never reaching the DB as a raw DataIntegrityViolationException**
  - Because findByEmail now actually matches an existing row with the same email, DuplicateEmployeeException is thrown before employeeRepository.save(...) is called, so GlobalExceptionHandler.handleDuplicateEmployee (409, existing ErrorResponse) intercepts it before Hibernate's flush can hit the database unique constraint.

## Risks to watch

- Story asks for a minimal diff: keep the change scoped to the new EmployeeRepository method and the two EmployeeService call sites, without restructuring surrounding validation logic.
- EmployeeServiceTest likely has fixtures that mock findByEmployeeNumber for the (currently broken) email-duplicate path; those mocks must be updated to stub findByEmail or the existing tests will pass for the wrong reason and mask the fix.

## Test hints

- Mirror the existing employee-number duplicate unit tests in EmployeeServiceTest for the email path: createEmployee/updateEmployee throw DuplicateEmployeeException when findByEmail returns a present Optional.
- Regression test: updateEmployee called with the employee's own unchanged email does not trigger a false-positive duplicate and still succeeds.
- Regression test: createEmployee/updateEmployee with a genuinely unique email still saves successfully (no regression).

## Story acceptance criteria (for reference)

1. `EmployeeRepository` exposes a `findByEmail(String email)` method (`Optional<Employee>`), analogous to the existing `findByEmployeeNumber`.
2. `EmployeeService.createEmployee(...)` checks the new `findByEmail(...)` — not `findByEmployeeNumber(...)` — when validating the email, and still throws `DuplicateEmployeeException("email", ...)` on a match, resulting in the existing `409 Conflict` response.
3. `EmployeeService.updateEmployee(...)` uses the same `findByEmail(...)` check when the request changes the email to one already used by a **different** employee, and does **not** false-positive when a caller submits the employee's own current email unchanged.
4. The existing employee-number duplicate check is untouched and keeps working as it does today.
5. Creating or updating an employee with a genuinely unique email still succeeds exactly as before (no regression).
6. A duplicate-email attempt is rejected with `409 Conflict` and the existing `ErrorResponse` body — it must never reach the database as a raw `DataIntegrityViolationException`.
