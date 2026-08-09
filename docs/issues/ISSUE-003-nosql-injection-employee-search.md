---
issue_id: ISSUE-003
title: MongoDB (NoSQL) injection in the employee search endpoint via string-concatenated BasicQuery
type: Vulnerability
severity: Critical
status: Open
reported_on: 2026-08-09
reported_by: Security review - injection
affected_services:
  - employee-service
affected_symbols:
  - EmployeeController.searchEmployees
  - EmployeeServiceImpl.searchEmployees
  - EmployeeSearchRepository.searchEmployees
affected_files:
  - employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java
  - employee-service/src/main/java/com/aura/vihanga/employeeservice/service/implementation/EmployeeServiceImpl.java
  - employee-service/src/main/java/com/aura/vihanga/employeeservice/repository/EmployeeSearchRepository.java
entry_points:
  - GET /api/v1/employee/search
---

# ISSUE-004 — MongoDB (NoSQL) injection in the employee search endpoint

## Summary

The employee search endpoint builds a MongoDB query by **concatenating raw request parameters into a
JSON query string** and handing that string to `BasicQuery`. Because the caller's input is placed
inside the query document without escaping or parameterisation, an attacker controls the *structure*
of the query, not just its values. This is a textbook NoSQL injection: MongoDB query operators such as
`$ne`, `$gt`, `$regex` and `$where` injected through the parameter are interpreted as query logic.

CWE-943 (Improper Neutralization of Special Elements in Data Query Logic), CWE-89 family for NoSQL.
OWASP **A03:2021 Injection**.

## Affected Area

| Field | Value |
|---|---|
| Service | `employee-service` |
| Endpoint | `GET /api/v1/employee/search?name=<...>&department=<...>` |
| Handler | [EmployeeController.searchEmployees](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L51) |
| Service | [EmployeeServiceImpl.searchEmployees](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/service/implementation/EmployeeServiceImpl.java#L109) |
| Sink | [EmployeeSearchRepository.searchEmployees](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/repository/EmployeeSearchRepository.java#L18) |

The vulnerable sink builds the query filter by string concatenation:

```java
// EmployeeSearchRepository.java
StringBuilder filter = new StringBuilder("{ ");
filter.append("'name': { $regex: '").append(name).append("' }");
if (department != null && !department.isEmpty()) {
    filter.append(", 'department': '").append(department).append("'");
}
filter.append(" }");
return mongoTemplate.find(new BasicQuery(filter.toString()), Employee.class);
```

The `name` and `department` values arrive directly from the untrusted query string in the controller
(`@RequestParam`) and are passed through the service layer unchanged. Nothing between the HTTP
boundary and `BasicQuery` validates, escapes or parameterises them.

## Data Flow (source → sink)

1. **Source** — `EmployeeController.searchEmployees` reads `name` and `department` from
   `@RequestParam`. ([EmployeeController.java:51](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java#L51))
2. **Propagation** — `EmployeeServiceImpl.searchEmployees` forwards both values without
   sanitisation. ([EmployeeServiceImpl.java:109](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/service/implementation/EmployeeServiceImpl.java#L109))
3. **Sink** — `EmployeeSearchRepository.searchEmployees` concatenates them into the JSON filter and
   executes it via `BasicQuery`. ([EmployeeSearchRepository.java:18](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/repository/EmployeeSearchRepository.java#L18))

## Observed Behavior

Because the value is placed inside a single-quoted JSON string that the caller can break out of, the
injected payload closes the intended `$regex` clause and appends attacker-chosen query operators.

**Benign request** — filter becomes `{ 'name': { $regex: 'Ann' } }`:
```
GET /api/v1/employee/search?name=Ann
```

**Injection — return every employee regardless of name.** Supplying a `name` that closes the
`$regex` object and injects an always-true operator turns the filter into one that matches all
documents:
```
GET /api/v1/employee/search?name=x' } }, { 'name': { $ne: '
```
The resulting filter string is
`{ 'name': { $regex: 'x' } }, { 'name': { $ne: '' } }`, i.e. the `$regex` constraint is neutralised
and the query returns the full collection.

**Injection — operator abuse via the `department` field.** The `department` value is interpolated as
a bare JSON value, so an operator document can be injected directly:
```
GET /api/v1/employee/search?name=x&department=' }, 'name': { $ne: '
```

**Injection — server-side JavaScript evaluation.** If `$where`/JavaScript execution is enabled on the
MongoDB deployment, a `$where` clause injected through the same hole runs arbitrary JavaScript in the
database engine, which can be used for boolean/time-based blind extraction and resource exhaustion.

**Reproducibility:** Deterministic. The endpoint is unauthenticated (see
[ISSUE-003](./ISSUE-003-unauthenticated-pii-exposure.md)), so no credentials are needed to reach the
sink.

## Expected Behavior

- The query must be built with **parameterised criteria**, not string concatenation — for example
  Spring Data derived queries (`findByNameContainingAndDepartment`) or the `Criteria` API
  (`Criteria.where("name").regex(Pattern.quote(name))`), which bind values rather than splicing them
  into the query document.
- If a regex search is required, the user input must be quoted with `Pattern.quote(...)` and anchored,
  so it is treated strictly as a literal.
- Input should be validated against an allow-list (length, permitted characters) at the controller
  boundary.
- The application's MongoDB user should have least privilege, and server-side JavaScript
  (`$where`, `mapReduce` with JS) should be disabled on the cluster.

## Steps to Reproduce

1. Start the platform and seed the `employee` collection with several employees whose names differ.
2. Confirm the benign path returns only matching records:
   ```bash
   curl -s "http://localhost:8500/api/v1/employee/search?name=Ann" | jq 'length'
   ```
3. Send the injection payload and observe that **all** records are returned regardless of name:
   ```bash
   curl -s -G "http://localhost:8500/api/v1/employee/search" \
        --data-urlencode "name=x' } }, { 'name': { \$ne: '" | jq 'length'
   ```
4. Compare the two counts — step 3 returns the full collection size, proving the `name` filter was
   neutralised by injected query logic.

## Impact

- **Confidentiality (Critical):** An attacker can enumerate and exfiltrate the entire `employee`
  collection — full PII — by neutralising the intended filter, and can perform blind boolean/time
  extraction of specific field values through injected operators.
- **Availability:** Injected operators such as an unanchored, catastrophic `$regex` or a `$where`
  JavaScript clause force expensive full-collection scans/evaluation, giving an unauthenticated
  caller a cheap denial-of-service primitive against the shared MongoDB instance.
- **Potential code execution in the DB engine:** Where server-side JavaScript is enabled, `$where`
  injection executes attacker-controlled JavaScript inside MongoDB.
- **Chained severity:** The sink sits behind an unauthenticated endpoint
  ([ISSUE-003](./ISSUE-003-unauthenticated-pii-exposure.md)) over an unbounded dataset
  ([ISSUE-002](./ISSUE-002-unbounded-findall-usage.md)), so no barrier stands between an anonymous
  attacker and a full-collection injection.

## Detection Notes

- Grep for the unsafe query construction:
  `git grep -n "BasicQuery" -- '*.java'` → [EmployeeSearchRepository.java](../../employee-service/src/main/java/com/aura/vihanga/employeeservice/repository/EmployeeSearchRepository.java).
- The `StringBuilder`/`append` pattern feeding a `BasicQuery` is the signature of the flaw — user
  input crosses into query structure with no `Criteria` binding and no `Pattern.quote`.
- SAST tools flag `new BasicQuery(<tainted string>)` as a NoSQL-injection sink; the taint source is
  the `@RequestParam` in `EmployeeController.searchEmployees`.
- No `@Valid` / bean validation is applied to the parameters at the controller boundary.
