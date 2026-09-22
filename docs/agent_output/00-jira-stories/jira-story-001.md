# JIRA-001 — Add pagination, sorting and filtering to the employee listing endpoint

| Field | Value |
|---|---|
| **Type** | Story (Enhancement) |
| **Priority** | High |
| **Status** | Ready for Development |
| **Component** | `employee-service` — `EmployeeController`, `EmployeeService`, `EmployeeRepository` |
| **Reported by** | Product Owner |
| **Reported on** | 2026-09-14 |
| **Labels** | `api`, `performance`, `pagination` |

## Summary

`GET /api/v1/employees` currently returns the entire `employees` table in one response
(`EmployeeService.getAllEmployees()` calls `employeeRepository.findAll()` with no limit). As the
roster grows this endpoint gets slower, returns unbounded payloads to every caller, and gives API
consumers no way to page through, sort, or narrow the result set. We need real pagination, sorting,
and basic filtering so the endpoint stays fast and usable at scale.

## Description

As an API consumer of the employee service, I want to request a specific page of employees, in a
specific order, optionally narrowed to a department or active/inactive status, so that I can build a
paginated UI (or a batch job) without pulling every employee row on every call.

Today:

- `EmployeeController.getAllEmployees()` maps `GET /api/v1/employees` straight to
  `EmployeeService.getAllEmployees()`, which returns `List<EmployeeResponse>` built from
  `employeeRepository.findAll()` — no `Pageable`, no limit, no sort.
- `EmployeeRepository` already extends `JpaRepository<Employee, Long>`, so paging support
  (`findAll(Pageable)`) is available from Spring Data with no new dependency.

This story adds paging, sorting, and optional filtering to that one endpoint only.

## Acceptance Criteria

1. `GET /api/v1/employees` accepts optional query parameters `page` (0-based, default `0`) and
   `size` (default `20`, capped at `100` — a request for a larger size is clamped, not rejected).
2. `GET /api/v1/employees` accepts an optional `sort` query parameter in the form
   `field,direction` (e.g. `sort=lastName,asc`, `sort=salary,desc`), restricted to real
   `Employee` fields (`firstName`, `lastName`, `email`, `department`, `salary`, `createdAt`).
   An unknown field or direction returns `400 Bad Request` with the existing
   `ErrorResponse` shape (see `GlobalExceptionHandler`), not a 500.
3. `GET /api/v1/employees` accepts optional `department` and `active` query parameters that
   filter the result set when present, and are ignored (no filter applied) when absent.
4. The response body changes from a bare JSON array to a page envelope carrying `content`
   (the list of `EmployeeResponse`), `page`, `size`, `totalElements`, and `totalPages`.
5. Calling the endpoint with no query parameters at all still returns HTTP 200 with the first
   page (default size) rather than erroring — existing manual/API-doc examples keep working,
   just with a different response shape (see **Risks** below).
6. `/api/v1/employees/search` and `/api/v1/employees/high-earners` are unchanged by this story.

## Out of Scope

- Paginating `/search` or `/high-earners` (candidates for a follow-up story).
- Cursor-based (as opposed to offset-based) pagination.
- Changing the default page size based on caller identity or role.

## Risks / Notes for Implementation

- **Breaking response shape.** Any existing client that expects a bare JSON array from
  `GET /api/v1/employees` will break when it becomes a page envelope. Call this out explicitly in
  the implementation plan; there is no versioned API path in this service today, so the
  Story/Impact Analyst should confirm this is acceptable before implementation starts.
- `EmployeeMapper` and `EmployeeResponse` should not need to change — only the controller/service
  signatures and a new lightweight page-response DTO.
- Prefer Spring Data's `Pageable`/`Page<T>` over hand-rolled offset math; the repository is already
  a `JpaRepository`, so `findAll(Specification, Pageable)` or a derived query with `Pageable` both
  work without new dependencies.
