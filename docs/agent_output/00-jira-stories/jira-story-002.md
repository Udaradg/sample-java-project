# JIRA-002 — Fix duplicate-email validation checking the wrong field

| Field | Value |
|---|---|
| **Type** | Bug |
| **Priority** | Critical |
| **Status** | Ready for Development |
| **Component** | `employee-service` — `EmployeeService`, `EmployeeRepository` |
| **Reported by** | QA |
| **Reported on** | 2026-09-16 |
| **Labels** | `data-integrity`, `validation`, `bug` |

## Summary

`Employee.email` has a database-level `unique = true` constraint, and the API is supposed to reject
a duplicate email with a clean `409 Conflict` (`DuplicateEmployeeException`). It doesn't, because
the duplicate-email check queries the wrong repository method: it looks up the *email* value in the
*employee number* index instead of an email index. In practice this means the duplicate-email check
almost never matches anything, and a genuine duplicate email is instead rejected by the database
constraint, surfacing as an unhandled `DataIntegrityViolationException` (HTTP 500) instead of the
intended `409 Conflict`.

## Description

As an HR administrator creating or updating employee records, I want the API to reject a duplicate
email address with a clear, handled error, so that I get a meaningful `409 Conflict` instead of a
generic server error.

Current (defective) behavior, in `EmployeeService`:

```java
// createEmployee(...)
if (employeeRepository.findByEmployeeNumber(request.getEmail()).isPresent()) {
    throw new DuplicateEmployeeException("email", request.getEmail());
}
```

```java
// updateEmployee(...)
if (request.getEmail() != null && !request.getEmail().equals(employee.getEmail())) {
    if (employeeRepository.findByEmployeeNumber(request.getEmail()).isPresent()) {
        throw new DuplicateEmployeeException("email", request.getEmail());
    }
}
```

Both call sites pass the *email* into `findByEmployeeNumber(...)`, which looks it up against
`Employee.employeeNumber`, not `Employee.email`. Since an email string essentially never matches an
existing `employeeNumber` value, this check almost always returns empty — the duplicate slips past
the service layer and fails only when Hibernate flushes the insert/update and Postgres enforces the
`unique` constraint on the `email` column, which `GlobalExceptionHandler` does not map to a clean
error today.

## Acceptance Criteria

1. `EmployeeRepository` exposes a `findByEmail(String email)` method (`Optional<Employee>`),
   analogous to the existing `findByEmployeeNumber`.
2. `EmployeeService.createEmployee(...)` checks the new `findByEmail(...)` — not
   `findByEmployeeNumber(...)` — when validating the email, and still throws
   `DuplicateEmployeeException("email", ...)` on a match, resulting in the existing `409 Conflict`
   response.
3. `EmployeeService.updateEmployee(...)` uses the same `findByEmail(...)` check when the request
   changes the email to one already used by a **different** employee, and does **not** false-positive
   when a caller submits the employee's own current email unchanged.
4. The existing employee-number duplicate check is untouched and keeps working as it does today.
5. Creating or updating an employee with a genuinely unique email still succeeds exactly as before
   (no regression).
6. A duplicate-email attempt is rejected with `409 Conflict` and the existing `ErrorResponse` body
   — it must never reach the database as a raw `DataIntegrityViolationException`.

## Out of Scope

- Case-insensitive email matching (email uniqueness stays case-sensitive, matching the current
  `@Email`/database column behavior).
- Adding a similar check anywhere outside `createEmployee`/`updateEmployee`.

## Risks / Notes for Implementation

- This is a two-line defect with a one-line root cause (wrong repository method called), but the
  fix touches both the repository interface and two service call sites — keep the diff minimal and
  do not restructure surrounding validation logic.
- `EmployeeServiceTest` already has fixtures for the employee-number duplicate path; mirror those for
  the email path rather than inventing a new test style.
