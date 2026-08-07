---
issue_id: ISSUE-001
title: Creating a department never completes and crashes the department-service worker thread
type: Defect
severity: Critical
status: Open
reported_on: 2026-08-06
reported_by: QA - API regression run
affected_services:
  - department-service
affected_symbols:
  - DepartmentController.createDepartment
affected_files:
  - department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java
entry_points:
  - POST /api/v1/department
---

# ISSUE-001 — Creating a department never completes and crashes the department-service worker thread

## Summary

Every call to the department creation endpoint `POST /api/v1/department` fails. The request never
returns a response body; instead the request thread dies with a `java.lang.StackOverflowError` and
the client receives an HTTP 500 (or a dropped connection, depending on the container). No department
record is ever written to MongoDB.

## Affected Area

| Field | Value |
|---|---|
| Service | `department-service` |
| Endpoint | `POST /api/v1/department` |
| Handler | `DepartmentController.createDepartment(Department)` |
| Location | [DepartmentController.java:23-32](../../department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java#L23-L32) |
| Persistence | MongoDB collection `department` (never reached) |

## Observed Behavior

1. The HTTP request is accepted and dispatched to the controller handler.
2. The handler does not delegate to the service layer; execution stays inside the controller and
   re-enters the same handler method with the same argument, indefinitely.
3. The JVM stack for that request thread is exhausted in a few milliseconds and
   `java.lang.StackOverflowError` is thrown.
4. `DepartmentServiceImpl.createDepartment()` is never invoked, so `departmentRepository.save()`
   is never invoked either.
5. The client receives an error response; nothing is persisted.

Representative stack trace (truncated — the same frame repeats thousands of times):

```
java.lang.StackOverflowError
	at com.aura.vihanga.departmentservice.controller.DepartmentController.createDepartment(DepartmentController.java:25)
	at com.aura.vihanga.departmentservice.controller.DepartmentController.createDepartment(DepartmentController.java:25)
	at com.aura.vihanga.departmentservice.controller.DepartmentController.createDepartment(DepartmentController.java:25)
	... repeated ...
```

## Expected Behavior

`POST /api/v1/department` should persist the submitted department and return HTTP `201 CREATED`
with a `StandardResponse` envelope containing the saved `DepartmentResponse`:

```json
{
  "statusCode": 201,
  "message": "Department Created Successfully",
  "data": {
    "departmentId": "68b1...",
    "departmentName": "Finance",
    "salary": 120000.0
  }
}
```

## Steps to Reproduce

1. Start `configuaration-server`, `discovery-service`, then `department-service`.
   (Ports are supplied by the config server; `department-service` defaults to `8501`.)
2. Issue the create request:
   ```bash
   curl -i -X POST http://localhost:8501/api/v1/department \
        -H "Content-Type: application/json" \
        -d '{"departmentName":"Finance","salary":120000}'
   ```
3. Observe the error response on the client and the `StackOverflowError` in the service log.
4. Query `GET /api/v1/department/salary/0` — the new department is absent, confirming nothing was
   written.

**Reproducibility:** 100% — every invocation, with any payload.

## Impact

- **Functional:** Department creation, a core write operation of the domain, is completely
  unavailable. No department can be onboarded through the API.
- **Downstream:** `employee-service` (`GET /api/v1/employee/salary/{id}`) and `report-service`
  (`GET /api/v1/export`) both resolve employee salary data by calling `department-service` over
  HTTP. Employees assigned to a department that could not be created resolve to no department, so
  those flows silently return incomplete data.
- **Stability:** Each failing request consumes a full request thread until the stack is exhausted.
  Repeated or automated retries (load tests, client retry policies) drive CPU and thread-pool
  pressure on the service instance.
- **Data:** No corruption — the failure occurs before any write reaches MongoDB.

## Detection Notes

- The generated function reference already flags this handler:
  `DepartmentController.createDepartment()` lists itself under both **Calls** and **Called by**
  with a self-call warning. See [function-reference.md](../function-reference.md).
- The two sibling handlers in the same controller (`getDepartment`, `getAllDepartments`) correctly
  delegate to `DepartmentService`, so the failure is isolated to the create path.
