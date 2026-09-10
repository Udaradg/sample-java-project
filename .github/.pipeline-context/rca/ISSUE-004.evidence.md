# Evidence Bundle — ISSUE-004

_Collected 2026-09-10T11:45:46.157Z by the Root Cause Analyst evidence collector. Facts only — no diagnosis._

**Issue:** Outdated Apache POI (poi-ooxml 5.0.0) dependency exposes the employee Excel-upload endpoint to a known OOXML parsing vulnerability (CVE-2025-31672)
**Type / Severity:** Vulnerability / Medium
**Reported services:** employee-service
**Source file:** `docs/agent_output/00-issues/issue-register.xlsx`

## 1. Input Sources

| Input | Status |
|---|---|
| Issue report | `docs/agent_output/00-issues/issue-register.xlsx` |
| `docs/agent_output/01-architecture/architecture.md` | loaded |
| `docs/agent_output/01-architecture/function-reference.md` | loaded |
| `.github/.pipeline-context/artifacts.json` | scanned 2026-09-10T11:00:06.470Z |
| Neo4j graph | live (depth 4) |

_Resolution note: 0 interface → implementation dispatch edge(s) were bridged into the call graph, because Spring injects the implementation behind the interface. Neo4j's raw `CALLS` edges stop at the interface, so paths below may be one hop longer than the graph shows._

## 2. Focus Points (issue symbols resolved to code)

### `EmployeeController.EmployeeController()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `void EmployeeController(EmployeeService employeeService)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 21-23)
- **Direct callers:** _none resolved_
- **Direct callees:** _none resolved_

```java
public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | **no** | _none_ |

### `EmployeeController.createEmployee()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<EmployeeResponse> createEmployee(EmployeeCreateRequest request)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 25-29)
- **REST endpoint:** `POST /api/v1/employees`
- **Annotations:** @PostMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.createEmployee()`

```java
@PostMapping
    public ResponseEntity<EmployeeResponse> createEmployee(@Valid @RequestBody EmployeeCreateRequest request) {
        EmployeeResponse response = employeeService.createEmployee(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.createEmployee()` | `EmployeeService.createEmployee()` |

**Outgoing paths (focus → … → callee):**

- EmployeeController.createEmployee() → EmployeeService.createEmployee() → EmployeeRepository.findByEmployeeNumber()
- EmployeeController.createEmployee() → EmployeeService.createEmployee() → EmployeeMapper.toEntity()
- EmployeeController.createEmployee() → EmployeeService.createEmployee() → EmployeeMapper.toResponse()

### `EmployeeController.getAllEmployees()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<List<EmployeeResponse>> getAllEmployees()`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 31-35)
- **REST endpoint:** `GET /api/v1/employees`
- **Annotations:** @GetMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.getAllEmployees()`

```java
@GetMapping
    public ResponseEntity<List<EmployeeResponse>> getAllEmployees() {
        List<EmployeeResponse> employees = employeeService.getAllEmployees();
        return ResponseEntity.ok(employees);
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.getAllEmployees()` | `EmployeeService.getAllEmployees()` |

**Outgoing paths (focus → … → callee):**

- EmployeeController.getAllEmployees() → EmployeeService.getAllEmployees()

### `EmployeeController.getEmployeeById()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<EmployeeResponse> getEmployeeById(Long id)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 37-41)
- **REST endpoint:** `GET /api/v1/employees/{id}`
- **Annotations:** @GetMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.getEmployeeById()`

```java
@GetMapping("/{id}")
    public ResponseEntity<EmployeeResponse> getEmployeeById(@PathVariable Long id) {
        EmployeeResponse employee = employeeService.getEmployeeById(id);
        return ResponseEntity.ok(employee);
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.getEmployeeById()` | `EmployeeService.getEmployeeById()` |

**Outgoing paths (focus → … → callee):**

- EmployeeController.getEmployeeById() → EmployeeService.getEmployeeById() → EmployeeMapper.toResponse()

### `EmployeeController.updateEmployee()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<EmployeeResponse> updateEmployee(Long id, EmployeeUpdateRequest request)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 43-49)
- **REST endpoint:** `PUT /api/v1/employees/{id}`
- **Annotations:** @PutMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.updateEmployee()`

```java
@PutMapping("/{id}")
    public ResponseEntity<EmployeeResponse> updateEmployee(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeUpdateRequest request) {
        EmployeeResponse response = employeeService.updateEmployee(id, request);
        return ResponseEntity.ok(response);
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.updateEmployee()` | `EmployeeService.updateEmployee()` |

**Outgoing paths (focus → … → callee):**

- EmployeeController.updateEmployee() → EmployeeService.updateEmployee() → EmployeeRepository.findByEmployeeNumber()
- EmployeeController.updateEmployee() → EmployeeService.updateEmployee() → EmployeeMapper.toResponse()

### `EmployeeController.deleteEmployee()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<Void> deleteEmployee(Long id)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 51-55)
- **REST endpoint:** `DELETE /api/v1/employees/{id}`
- **Annotations:** @DeleteMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.deleteEmployee()`

```java
@DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable Long id) {
        employeeService.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.deleteEmployee()` | `EmployeeService.deleteEmployee()` |

**Outgoing paths (focus → … → callee):**

- EmployeeController.deleteEmployee() → EmployeeService.deleteEmployee()

### `EmployeeController.searchByDepartment()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<List<EmployeeResponse>> searchByDepartment(String department)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 57-62)
- **REST endpoint:** `GET /api/v1/employees/search`
- **Annotations:** @GetMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.searchByDepartment()`

```java
@GetMapping("/search")
    public ResponseEntity<List<EmployeeResponse>> searchByDepartment(
            @RequestParam String department) {
        List<EmployeeResponse> employees = employeeService.searchByDepartment(department);
        return ResponseEntity.ok(employees);
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.searchByDepartment()` | `EmployeeService.searchByDepartment()` |

**Outgoing paths (focus → … → callee):**

- EmployeeController.searchByDepartment() → EmployeeService.searchByDepartment() → EmployeeRepository.findByDepartmentIgnoreCase()

### `EmployeeController.getHighEarners()`

- **Module:** `spring-boot-migration-demo`
- **Signature:** `ResponseEntity<List<EmployeeResponse>> getHighEarners(BigDecimal salary)`
- **Location:** `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 64-69)
- **REST endpoint:** `GET /api/v1/employees/high-earners`
- **Annotations:** @GetMapping
- **Direct callers:** _none resolved_
- **Direct callees:** `EmployeeService.findHighEarners()`

```java
@GetMapping("/high-earners")
    public ResponseEntity<List<EmployeeResponse>> getHighEarners(
            @RequestParam BigDecimal salary) {
        List<EmployeeResponse> employees = employeeService.findHighEarners(salary);
        return ResponseEntity.ok(employees);
    }
```

**Injected collaborators of `EmployeeController`** — what this method could delegate to:

| Field | Resolves to | Called by focus method | Method of the same name available |
|---|---|---|---|
| `EmployeeService employeeService` | `EmployeeService` (class) | yes — `EmployeeService.findHighEarners()` | _none_ |

**Outgoing paths (focus → … → callee):**

- EmployeeController.getHighEarners() → EmployeeService.findHighEarners() → EmployeeRepository.findHighEarners()

### `EmployeeServiceImpl.uploadEmployee` — UNRESOLVED

Could not match this symbol in `artifacts.json`. Re-run the Code Cartographer scan or correct `affected_symbols` in the issue file.

### `ExcelUploadImpl.getEmployeeDataFromExcel` — UNRESOLVED

Could not match this symbol in `artifacts.json`. Re-run the Code Cartographer scan or correct `affected_symbols` in the issue file.

### `ExcelUploadImpl.isValidExcelFile` — UNRESOLVED

Could not match this symbol in `artifacts.json`. Re-run the Code Cartographer scan or correct `affected_symbols` in the issue file.

## 3. Affected Area

- **Modules touched (Java call graph):** `spring-boot-migration-demo`
- **REST endpoints on a reaching path:** `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees`, `GET /api/v1/employees/high-earners`, `GET /api/v1/employees/search`, `GET /api/v1/employees/{id}`, `POST /api/v1/employees`, `PUT /api/v1/employees/{id}`
- **Types on a reaching path:** `EmployeeController`, `EmployeeMapper`, `EmployeeRepository`, `EmployeeService`
- **Scheduled jobs on a reaching path:** _none_

## 4. Architecture Context

**Affected modules (from the module table):**

| Module | Packaging | Key Spring dependencies |
|---|---|---|
| `spring-boot-migration-demo` | jar | spring-boot-starter-web, spring-boot-starter-data-jpa, spring-boot-starter-validation, spring-boot-starter-security, spring-boot-starter-actuator, spring-boot-starter-test |

**Related REST surface rows:**

| Method | Path | Handler | Module |
|---|---|---|---|
| `POST` | `/api/v1/employees` | EmployeeController.createEmployee() | `spring-boot-migration-demo` |
| `GET` | `/api/v1/employees` | EmployeeController.getAllEmployees() | `spring-boot-migration-demo` |
| `GET` | `/api/v1/employees/{id}` | EmployeeController.getEmployeeById() | `spring-boot-migration-demo` |
| `PUT` | `/api/v1/employees/{id}` | EmployeeController.updateEmployee() | `spring-boot-migration-demo` |
| `DELETE` | `/api/v1/employees/{id}` | EmployeeController.deleteEmployee() | `spring-boot-migration-demo` |
| `GET` | `/api/v1/employees/high-earners` | EmployeeController.getHighEarners() | `spring-boot-migration-demo` |
| `GET` | `/api/v1/employees/search` | EmployeeController.searchByDepartment() | `spring-boot-migration-demo` |

**Service topology:**

```mermaid
flowchart LR
  spring_boot_migration_demo["spring-boot-migration-demo"]
```

**Documented observations:**

- Each service (`department-service`, `employee-service`, `report-service`, `sheduler-service`) follows the same layered convention: `controller` → `service` → `repository` → `model`/`entity`, backed by MongoDB repositories.
- `configuaration-server` and `discovery-service` are infrastructure services (Spring Cloud Config + Eureka) that every business service depends on at startup via `bootstrap.properties`.
- No Feign clients were detected — cross-service calls, if any, likely go through `RestTemplate`/`WebClient` rather than declarative Feign interfaces. Worth confirming if service-to-service coupling should show up as graph edges.
- The generated Neo4j graph can be queried directly (e.g. `MATCH (m:Module)-[:CONTAINS]->(t:Type) RETURN m.name, count(t)`) for deeper, ad-hoc architecture questions beyond this static document.

## 5. Graph Findings

Connected to `neo4j+s://7d610372.databases.neo4j.io`, database traversal depth 4.

**`com.example.migrationdemo.controller.EmployeeController#EmployeeController(EmployeeService)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 0
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#createEmployee(EmployeeCreateRequest)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 4
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#getAllEmployees()`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 1
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#getEmployeeById(Long)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 2
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#updateEmployee(Long,EmployeeUpdateRequest)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 3
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#deleteEmployee(Long)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 1
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#searchByDepartment(String)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 2
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**`com.example.migrationdemo.controller.EmployeeController#getHighEarners(BigDecimal)`**

- Owning type: `EmployeeController` in module `spring-boot-migration-demo`
- Endpoints exposed by that type: `POST /api/v1/employees`, `GET /api/v1/employees`, `GET /api/v1/employees/{id}`, `PUT /api/v1/employees/{id}`, `DELETE /api/v1/employees/{id}`, `GET /api/v1/employees/search`, `GET /api/v1/employees/high-earners`
- Upstream caller paths in graph: 0
- Downstream callee paths in graph: 2
- Modules reaching it: _none_
- Types depending on the owning type (`USES` fan-in): _none_

**Maven dependencies of the affected modules:**

- `spring-boot-migration-demo`: 12 declared dependencies

**Graph size:** Method 127, Type 17, ContextNote 13, MavenDependency 12, Package 11, Endpoint 7, ExternalType 5, Module 1

**Relationships:** HAS_METHOD 127, CONTAINS 45, ABOUT 34, CALLS 17, DEPENDS_ON 12, EXPOSES 7, USES 4, EXTENDS 4, IMPLEMENTS 2

## 6. Function Reference Excerpts

<details><summary><code>EmployeeController.EmployeeController()</code></summary>

#### `EmployeeController.EmployeeController()`
- **Signature**: `void EmployeeController(EmployeeService employeeService)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 21-23)
- **Calls**: _none resolved_
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }
```

</details>

<details><summary><code>EmployeeController.createEmployee()</code></summary>

#### `EmployeeController.createEmployee()`
- **Signature**: `ResponseEntity<EmployeeResponse> createEmployee(EmployeeCreateRequest request)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 25-29)
- **Annotations**: @PostMapping
- **REST endpoint**: `POST /api/v1/employees`
- **Calls**: `EmployeeService.createEmployee()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@PostMapping
    public ResponseEntity<EmployeeResponse> createEmployee(@Valid @RequestBody EmployeeCreateRequest request) {
        EmployeeResponse response = employeeService.createEmployee(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }
```

</details>

<details><summary><code>EmployeeController.getAllEmployees()</code></summary>

#### `EmployeeController.getAllEmployees()`
- **Signature**: `ResponseEntity<List<EmployeeResponse>> getAllEmployees()`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 31-35)
- **Annotations**: @GetMapping
- **REST endpoint**: `GET /api/v1/employees`
- **Calls**: `EmployeeService.getAllEmployees()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@GetMapping
    public ResponseEntity<List<EmployeeResponse>> getAllEmployees() {
        List<EmployeeResponse> employees = employeeService.getAllEmployees();
        return ResponseEntity.ok(employees);
    }
```

</details>

<details><summary><code>EmployeeController.getEmployeeById()</code></summary>

#### `EmployeeController.getEmployeeById()`
- **Signature**: `ResponseEntity<EmployeeResponse> getEmployeeById(Long id)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 37-41)
- **Annotations**: @GetMapping("/{id}")
- **REST endpoint**: `GET /api/v1/employees/{id}`
- **Calls**: `EmployeeService.getEmployeeById()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@GetMapping("/{id}")
    public ResponseEntity<EmployeeResponse> getEmployeeById(@PathVariable Long id) {
        EmployeeResponse employee = employeeService.getEmployeeById(id);
        return ResponseEntity.ok(employee);
    }
```

</details>

<details><summary><code>EmployeeController.updateEmployee()</code></summary>

#### `EmployeeController.updateEmployee()`
- **Signature**: `ResponseEntity<EmployeeResponse> updateEmployee(Long id, EmployeeUpdateRequest request)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 43-49)
- **Annotations**: @PutMapping("/{id}")
- **REST endpoint**: `PUT /api/v1/employees/{id}`
- **Calls**: `EmployeeService.updateEmployee()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@PutMapping("/{id}")
    public ResponseEntity<EmployeeResponse> updateEmployee(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeUpdateRequest request) {
        EmployeeResponse response = employeeService.updateEmployee(id, request);
        return ResponseEntity.ok(response);
    }
```

</details>

<details><summary><code>EmployeeController.deleteEmployee()</code></summary>

#### `EmployeeController.deleteEmployee()`
- **Signature**: `ResponseEntity<Void> deleteEmployee(Long id)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 51-55)
- **Annotations**: @DeleteMapping("/{id}")
- **REST endpoint**: `DELETE /api/v1/employees/{id}`
- **Calls**: `EmployeeService.deleteEmployee()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable Long id) {
        employeeService.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }
```

</details>

<details><summary><code>EmployeeController.searchByDepartment()</code></summary>

#### `EmployeeController.searchByDepartment()`
- **Signature**: `ResponseEntity<List<EmployeeResponse>> searchByDepartment(String department)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 57-62)
- **Annotations**: @GetMapping("/search")
- **REST endpoint**: `GET /api/v1/employees/search`
- **Calls**: `EmployeeService.searchByDepartment()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@GetMapping("/search")
    public ResponseEntity<List<EmployeeResponse>> searchByDepartment(
            @RequestParam String department) {
        List<EmployeeResponse> employees = employeeService.searchByDepartment(department);
        return ResponseEntity.ok(employees);
    }
```

</details>

<details><summary><code>EmployeeController.getHighEarners()</code></summary>

#### `EmployeeController.getHighEarners()`
- **Signature**: `ResponseEntity<List<EmployeeResponse>> getHighEarners(BigDecimal salary)`
- **Location**: `src/main/java/com/example/migrationdemo/controller/EmployeeController.java` (lines 64-69)
- **Annotations**: @GetMapping("/high-earners")
- **REST endpoint**: `GET /api/v1/employees/high-earners`
- **Calls**: `EmployeeService.findHighEarners()`
- **Called by**: _none resolved (likely an entry point or only called externally)_

```java
@GetMapping("/high-earners")
    public ResponseEntity<List<EmployeeResponse>> getHighEarners(
            @RequestParam BigDecimal salary) {
        List<EmployeeResponse> employees = employeeService.findHighEarners(salary);
        return ResponseEntity.ok(employees);
    }
```

</details>

<details><summary><code>EmployeeMapper.toEntity()</code></summary>

#### `EmployeeMapper.toEntity()`
- **Signature**: `Employee toEntity(EmployeeCreateRequest request)`
- **Location**: `src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java` (lines 11-19)
- **Calls**: _none resolved_
- **Called by**: `EmployeeService.createEmployee()`

```java
public Employee toEntity(EmployeeCreateRequest request) {
        return new Employee(
                request.getEmployeeNumber(),
                request.getFirstName(),
                request.getLastName(),
                request.getEmail(),
                request.getDepartment(),
                request.getSalary());
    }
```

</details>

<details><summary><code>EmployeeMapper.toResponse()</code></summary>

#### `EmployeeMapper.toResponse()`
- **Signature**: `EmployeeResponse toResponse(Employee employee)`
- **Location**: `src/main/java/com/example/migrationdemo/mapper/EmployeeMapper.java` (lines 21-33)
- **Calls**: _none resolved_
- **Called by**: `EmployeeService.createEmployee()`, `EmployeeService.getEmployeeById()`, `EmployeeService.updateEmployee()`

```java
public EmployeeResponse toResponse(Employee employee) {
        return new EmployeeResponse(
                employee.getId(),
                employee.getEmployeeNumber(),
                employee.getFirstName(),
                employee.getLastName(),
                employee.getEmail(),
                employee.getDepartment(),
                employee.getSalary(),
                employee.getActive(),
                employee.getCreatedAt(),
                employee.getUpdatedAt());
    }
```

</details>

<details><summary><code>EmployeeRepository.findByEmployeeNumber()</code></summary>

#### `EmployeeRepository.findByEmployeeNumber()`
- **Signature**: `Optional<Employee> findByEmployeeNumber(String employeeNumber)`
- **Location**: `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` (lines 16-16)
- **Calls**: _none resolved_
- **Called by**: `EmployeeService.createEmployee()`, `EmployeeService.createEmployee()`, `EmployeeService.updateEmployee()`

```java
Optional<Employee> findByEmployeeNumber(String employeeNumber);
```

</details>

<details><summary><code>EmployeeRepository.findByDepartmentIgnoreCase()</code></summary>

#### `EmployeeRepository.findByDepartmentIgnoreCase()`
- **Signature**: `List<Employee> findByDepartmentIgnoreCase(String department)`
- **Location**: `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` (lines 18-18)
- **Calls**: _none resolved_
- **Called by**: `EmployeeService.searchByDepartment()`

```java
List<Employee> findByDepartmentIgnoreCase(String department);
```

</details>

<details><summary><code>EmployeeRepository.findHighEarners()</code></summary>

#### `EmployeeRepository.findHighEarners()`
- **Signature**: `List<Employee> findHighEarners(BigDecimal salary)`
- **Location**: `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java` (lines 37-45)
- **Annotations**: @Query("""
            select *
            from employees
            where salary > :salary
            and active = true
            order by salary desc
            """, nativeQuery = "true")
- **Calls**: _none resolved_
- **Called by**: `EmployeeService.findHighEarners()`

```java
@Query(value = """
            select *
            from employees
            where salary > :salary
            and active = true
            order by salary desc
            """, nativeQuery = true)
    List<Employee> findHighEarners(
            @Param("salary") BigDecimal salary);
```

</details>

<details><summary><code>EmployeeService.createEmployee()</code></summary>

#### `EmployeeService.createEmployee()`
- **Signature**: `EmployeeResponse createEmployee(EmployeeCreateRequest request)`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 29-44)
- **Annotations**: @Transactional
- **Calls**: `EmployeeRepository.findByEmployeeNumber()`, `EmployeeRepository.findByEmployeeNumber()`, `EmployeeMapper.toEntity()`, `EmployeeMapper.toResponse()`
- **Called by**: `EmployeeController.createEmployee()`

```java
@Transactional
    public EmployeeResponse createEmployee(EmployeeCreateRequest request) {
        // Check for duplicate employee number
        if (employeeRepository.findByEmployeeNumber(request.getEmployeeNumber()).isPresent()) {
            throw new DuplicateEmployeeException("employeeNumber", request.getEmployeeNumber());
        }

        // Check for duplicate email
        if (employeeRepository.findByEmployeeNumber(request.getEmail()).isPresent()) {
            throw new DuplicateEmployeeException("email", request.getEmail());
        }

        Employee employee = employeeMapper.toEntity(request);
        Employee savedEmployee = employeeRepository.save(employee);
        return employeeMapper.toResponse(savedEmployee);
    }
```

</details>

<details><summary><code>EmployeeService.getAllEmployees()</code></summary>

#### `EmployeeService.getAllEmployees()`
- **Signature**: `List<EmployeeResponse> getAllEmployees()`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 46-52)
- **Annotations**: @Transactional(readOnly = "true")
- **Calls**: _none resolved_
- **Called by**: `EmployeeController.getAllEmployees()`

```java
@Transactional(readOnly = true)
    public List<EmployeeResponse> getAllEmployees() {
        return employeeRepository.findAll()
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }
```

</details>

<details><summary><code>EmployeeService.getEmployeeById()</code></summary>

#### `EmployeeService.getEmployeeById()`
- **Signature**: `EmployeeResponse getEmployeeById(Long id)`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 54-59)
- **Annotations**: @Transactional(readOnly = "true")
- **Calls**: `EmployeeMapper.toResponse()`
- **Called by**: `EmployeeController.getEmployeeById()`

```java
@Transactional(readOnly = true)
    public EmployeeResponse getEmployeeById(Long id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));
        return employeeMapper.toResponse(employee);
    }
```

</details>

<details><summary><code>EmployeeService.updateEmployee()</code></summary>

#### `EmployeeService.updateEmployee()`
- **Signature**: `EmployeeResponse updateEmployee(Long id, EmployeeUpdateRequest request)`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 61-95)
- **Annotations**: @Transactional
- **Calls**: `EmployeeRepository.findByEmployeeNumber()`, `EmployeeMapper.toResponse()`
- **Called by**: `EmployeeController.updateEmployee()`

```java
@Transactional
    public EmployeeResponse updateEmployee(Long id, EmployeeUpdateRequest request) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));

        // Check for duplicate email if email is being updated
        if (request.getEmail() != null && !request.getEmail().equals(employee.getEmail())) {
            if (employeeRepository.findByEmployeeNumber(request.getEmail()).isPresent()) {
                throw new DuplicateEmployeeException("email", request.getEmail());
            }
        }

        // Update fields
        if (request.getFirstName() != null) {
            employee.setFirstName(request.getFirstName());
        }
        if (request.getLastName() != null) {
            employee.setLastName(request.getLastName());
        }
        if (request.getEmail() != null) {
            employee.setEmail(request.getEmail());
        }
        if (request.getDepartment() != null) {
            employee.setDepartment(request.getDepartment());
        }
        if (request.getSalary() != null) {
            employee.setSalary(request.getSalary());
        }
        if (request.getActive() != null) {
            employee.setActive(request.getActive());
        }

        Employee updatedEmployee = employeeRepository.save(employee);
        return employeeMapper.toResponse(updatedEmployee);
    }
```

</details>

<details><summary><code>EmployeeService.deleteEmployee()</code></summary>

#### `EmployeeService.deleteEmployee()`
- **Signature**: `void deleteEmployee(Long id)`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 97-102)
- **Annotations**: @Transactional
- **Calls**: _none resolved_
- **Called by**: `EmployeeController.deleteEmployee()`

```java
@Transactional
    public void deleteEmployee(Long id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));
        employeeRepository.delete(employee);
    }
```

</details>

<details><summary><code>EmployeeService.searchByDepartment()</code></summary>

#### `EmployeeService.searchByDepartment()`
- **Signature**: `List<EmployeeResponse> searchByDepartment(String department)`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 104-110)
- **Annotations**: @Transactional(readOnly = "true")
- **Calls**: `EmployeeRepository.findByDepartmentIgnoreCase()`
- **Called by**: `EmployeeController.searchByDepartment()`

```java
@Transactional(readOnly = true)
    public List<EmployeeResponse> searchByDepartment(String department) {
        return employeeRepository.findByDepartmentIgnoreCase(department)
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }
```

</details>

<details><summary><code>EmployeeService.findHighEarners()</code></summary>

#### `EmployeeService.findHighEarners()`
- **Signature**: `List<EmployeeResponse> findHighEarners(BigDecimal salary)`
- **Location**: `src/main/java/com/example/migrationdemo/service/EmployeeService.java` (lines 120-126)
- **Annotations**: @Transactional(readOnly = "true")
- **Calls**: `EmployeeRepository.findHighEarners()`
- **Called by**: `EmployeeController.getHighEarners()`

```java
@Transactional(readOnly = true)
    public List<EmployeeResponse> findHighEarners(BigDecimal salary) {
        return employeeRepository.findHighEarners(salary)
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }
```

</details>

## 7. Reported Symptom (verbatim from the issue file)

# ISSUE-004 — Outdated Apache POI (poi-ooxml 5.0.0) dependency exposes the employee Excel-upload endpoint to a known OOXML parsing vulnerability (CVE-2025-31672)

## Summary

employee-service/pom.xml explicitly pins org.apache.poi:poi-ooxml to version 5.0.0 (not inherited from the Spring Boot parent - a direct, hand-written <version> tag). That version carries a public, current CVE: CVE-2025-31672. Apache POI's OOXML reader performs no uniqueness check on ZIP entry paths inside an .xlsx/.docx/.pptx package when it loads the archive, so a crafted upload containing duplicate entry paths can make different tools (or different code paths within the same JVM) disagree about which entry's content is actually being read - an integrity/content-confusion defect, not remote code execution. Fixed upstream in poi-ooxml 5.4.0.

This dependency is not merely present in the tree - it is used directly on caller-uploaded, untrusted bytes. ExcelUploadImpl.getEmployeeDataFromExcel(MultipartFile) constructs new XSSFWorkbook(multipartFile.getInputStream()) straight from the HTTP request body of POST /api/v1/employee/excelUpload, with no antivirus/structure pre-check beyond a client-supplied Content-Type string match. This is a textbook case of the exact untrusted-input class CVE-2025-31672 concerns: the vulnerable parser is fed adversary-controlled OOXML content directly.

## Data Flow (source → sink)

Source: an authenticated-or-not caller (this endpoint has its own separate exposure - see ISSUE-002 - so today it is reachable by anyone) POSTs a .xlsx file to /api/v1/employee/excelUpload.
1. EmployeeController.uploadEmployee (EmployeeController.java:41-42) receives the MultipartFile and calls employeeService.uploadEmployee(multipartFile) with no content inspection of its own.
2. EmployeeServiceImpl.uploadEmployee (EmployeeServiceImpl.java:125-131) checks ExcelUploadImpl.isValidExcelFile(multipartFile) - a single string comparison against the client-supplied Content-Type header (application/vnd.openxmlformats-officedocument.spreadsheetml.sheet), which a caller controls and can spoof; it is not a structural check of the file's actual bytes.
3. Sink: ExcelUploadImpl.getEmployeeDataFromExcel (ExcelUploadImpl.java:27-30) calls new XSSFWorkbook(multipartFile.getInputStream()) directly on the uploaded bytes - this is the exact vulnerable poi-ooxml 5.0.0 OOXML-package-loading code path CVE-2025-31672 describes.
4. The parsed rows are mapped into Employee objects (ExcelUploadImpl.java:39-57) and persisted via employeeRepository.saveAll(employees) (EmployeeServiceImpl.java:129) - so a successful parse of ambiguous/crafted content is written straight to the employee collection with no further validation.

## Observed Behavior

employee-service/pom.xml declares <groupId>org.apache.poi</groupId><artifactId>poi-ooxml</artifactId><version>5.0.0</version> as an explicit, hand-pinned version - not inherited from the spring-boot-starter-parent (which does not manage a POI version at all), and not overridden anywhere else in the module.
Version 5.0.0 was released before the CVE-2025-31672 fix; the advisory affects poi-ooxml before 5.4.0.
ExcelUploadImpl.getEmployeeDataFromExcel constructs the workbook directly from the multipart upload stream with no pre-parse structural validation and no size/entry-count limit.
isValidExcelFile only compares the request's declared Content-Type string - it does not open or validate the archive structure itself, so it provides no defence against a crafted file with a spoofed or accurate Content-Type header.

## Expected Behavior

Every third-party library that parses untrusted, caller-supplied input (uploaded files, in particular) should be kept at or above the version that fixes its most recent known parsing-related CVE - not left pinned to whatever version was current when the dependency was first added.
A version bump for a security fix should target the minimum version that actually contains the fix, verified against the advisory, and should be confirmed to actually take effect in the resolved dependency tree - not just the declared version string.
Ideally, uploaded file structure should also be validated before being handed to a parsing library, independent of which library version is in use - out of scope for this issue's fix (which addresses the outdated-dependency root cause), but worth tracking as a defence-in-depth follow-up.

## Steps to Reproduce

1. Confirm the pinned version: grep -A1 poi-ooxml employee-service/pom.xml shows <version>5.0.0</version>.
2. Cross-reference 5.0.0 against the public advisory at https://github.com/advisories/GHSA-gmg8-593g-7mv3 (CVE-2025-31672) - confirms affected versions are "< 5.4.0", so 5.0.0 is in range.
3. Start employee-service (with configuaration-server and discovery-service for config/registration).
4. Construct an .xlsx file containing two ZIP entries with the same internal path (the specific malformed-archive shape the advisory describes) and POST it to /api/v1/employee/excelUpload with Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.
5. Observe that poi-ooxml 5.0.0 loads the archive without rejecting the duplicate entry, versus a patched (>=5.4.0) build, which throws rather than silently picking one entry - confirming the vulnerable code path is reachable from this endpoint.
Reproducibility: deterministic once a crafted file is constructed - this is a version/parsing-logic issue, not a race condition or timing-dependent condition.

## Impact

Integrity: a crafted upload can cause the application to read different content than what another tool (or a human reviewer) sees when opening the same file, per the advisory's own description ("tools disagree about what the document contains"). Given this endpoint writes parsed rows straight into the employee collection, a content-confusion condition here has a direct path to inserting attacker-influenced data.
Not remote code execution - the advisory itself characterises this as improper input validation leading to integrity loss, not arbitrary code execution or memory corruption.
Compounds with ISSUE-002 (missing authentication): today this endpoint has no authentication requirement, so exploitation is not limited to a trusted internal user.
Systemic risk beyond this one CVE: pinning a specific version and never revisiting it means this module will silently accumulate every future POI CVE too, not just this one - the fix should establish the pattern (explicit pin, deliberately kept current), not just resolve this single advisory.

## Detection Notes

grep -A1 "poi-ooxml" employee-service/pom.xml shows the pinned <version>5.0.0</version> - the exact signature to re-check after a fix (the version string should read 5.4.0 or higher).
grep -rn "XSSFWorkbook" employee-service/src/main/java confirms exactly one call site, ExcelUploadImpl.java:30, taking multipartFile.getInputStream() directly - the sink this fix must not change the shape of (only the dependency version), so re-scanning after a fix should still find the same call site, just backed by a patched library version.
mvn dependency:tree run inside employee-service, filtered to org.apache.poi, is the authoritative check that the resolved (not just declared) version reflects the fix.
