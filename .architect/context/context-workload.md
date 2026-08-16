# Context Weaver — Authoring Brief

_Generated 2026-08-16T01:14:33.510Z from a scan taken 2026-08-16T01:14:03.956Z._

**77 node(s) need a description** — 6 Module, 10 Endpoint, 4 ExternalType, 34 Type, 10 Package, 13 Method.
Reusable from the previous run: 0. Selection thresholds: type ≥ 3, method ≥ 3.

## How to use this brief

Write one entry per node below into `.architect/context/descriptions.json`, validating against
[descriptions.schema.json](../../.github/skills/context-weaver/templates/descriptions.schema.json).
Copy each node's `kind`, `id` and `fingerprint` verbatim — they are how the description binds to the graph.

Write for the agent that reads this next, not for a human browsing docs:

- **summary** — what this is and what it is for, in the domain's words. `"Owns the employee roster and is the only writer of the employees collection"`, not `"a service class"`.
- **failureModes / invariants** — what breaks if this is wrong, and what must stay true. This is what a Root Cause agent needs and cannot derive from an AST.
- **sideEffects** — writes, outbound calls, mutated state. This is what a Blast Radius agent needs.
- **testHints** — how to exercise it. This is what a QA agent needs.
- **criticality** — how much damage a defect here does, not how complex the code is.

Ground every claim in the evidence below or in the source file. If you cannot tell what something is for,
say so with `"confidence": "low"` — a hedged description is useful, an invented one is not. Skip a node
entirely rather than pad it; a missing description is a smaller problem than a wrong one.

## Nodes

### `Module` — configuaration-server

- **id:** `configuaration-server`
- **status:** NEW
- **selected because:** deployable service boundary
- **Packaging:** `war`
- **Types in module:** 1
- **Maven dependencies:** `org.springframework.boot:spring-boot-starter-actuator`, `org.springframework.cloud:spring-cloud-config-server`, `org.springframework.cloud:spring-cloud-starter-netflix-eureka-client`, `org.springframework.boot:spring-boot-starter-test`

### `Module` — department-service

- **id:** `department-service`
- **status:** NEW
- **selected because:** deployable service boundary
- **Packaging:** `war`
- **REST endpoints:** `POST /api/v1/department`, `GET /api/v1/department/{id}`, `GET /api/v1/department/salary/{minSalary}`
- **Types in module:** 8
- **Maven dependencies:** `org.springframework.boot:spring-boot-starter-data-mongodb`, `org.springframework.boot:spring-boot-starter-web`, `org.springframework.cloud:spring-cloud-starter-netflix-eureka-client`, `org.springframework.cloud:spring-cloud-starter-config`, `org.springframework.cloud:spring-cloud-starter-bootstrap`, `org.projectlombok:lombok`, `org.springframework.boot:spring-boot-starter-test`, `io.cucumber:cucumber-junit`, `io.cucumber:cucumber-java`, `io.cucumber:cucumber-spring`

### `Module` — discovery-service

- **id:** `discovery-service`
- **status:** NEW
- **selected because:** deployable service boundary
- **Packaging:** `war`
- **Types in module:** 1
- **Maven dependencies:** `org.springframework.boot:spring-boot-starter-web`, `org.springframework.cloud:spring-cloud-starter-netflix-eureka-server`, `org.springframework.boot:spring-boot-starter-test`

### `Module` — employee-service

- **id:** `employee-service`
- **status:** NEW
- **selected because:** deployable service boundary
- **Packaging:** `war`
- **REST endpoints:** `POST /api/v1/employee`, `POST /api/v1/employee/excelUpload`, `GET /api/v1/employee/search`, `GET /api/v1/employee/{id}`, `GET /api/v1/employee/salary/{id}`
- **Types in module:** 18
- **Maven dependencies:** `org.springframework.boot:spring-boot-starter-data-mongodb`, `org.springframework.boot:spring-boot-starter-web`, `org.springframework.cloud:spring-cloud-starter-circuitbreaker-resilience4j`, `org.springframework.cloud:spring-cloud-starter-netflix-eureka-client`, `org.springframework.boot:spring-boot-starter-actuator`, `org.springframework.boot:spring-boot-starter-aop`, `org.projectlombok:lombok`, `org.springframework.boot:spring-boot-starter-webflux`, `org.springframework.cloud:spring-cloud-starter-config`, `org.springframework.cloud:spring-cloud-starter-bootstrap`, `org.springframework.boot:spring-boot-starter-test`, `org.apache.poi:poi-ooxml`, `io.cucumber:cucumber-junit`, `io.cucumber:cucumber-java`, `org.jacoco:jacoco-maven-plugin`

### `Module` — report-service

- **id:** `report-service`
- **status:** NEW
- **selected because:** deployable service boundary
- **Packaging:** `war`
- **REST endpoints:** `GET /api/v1/export`
- **Types in module:** 14
- **Maven dependencies:** `org.springframework.boot:spring-boot-starter-data-mongodb`, `org.springframework.boot:spring-boot-starter-web`, `org.springframework.boot:spring-boot-starter-webflux`, `org.springframework.cloud:spring-cloud-starter-config`, `org.springframework.cloud:spring-cloud-starter-bootstrap`, `org.springframework.cloud:spring-cloud-starter-netflix-eureka-client`, `org.projectlombok:lombok`, `org.springframework.boot:spring-boot-starter-test`, `io.projectreactor:reactor-test`, `org.apache.poi:poi-ooxml`

### `Module` — sheduler-service

- **id:** `sheduler-service`
- **status:** NEW
- **selected because:** deployable service boundary
- **Packaging:** `war`
- **REST endpoints:** `GET /api/v1/employee`
- **Types in module:** 9
- **Maven dependencies:** `org.springframework.boot:spring-boot-starter-data-mongodb`, `org.springframework.boot:spring-boot-starter-web`, `org.springframework.cloud:spring-cloud-starter-config`, `org.springframework.cloud:spring-cloud-starter-bootstrap`, `org.springframework.cloud:spring-cloud-starter-netflix-eureka-client`, `org.projectlombok:lombok`, `org.springframework.boot:spring-boot-starter-test`

### `Endpoint` — GET /api/v1/department/{id}

- **id:** `GET /api/v1/department/{id}`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `department-service`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:34`
- **Signature:** `DepartmentResponse getDepartment(String departmentId)`
- **Handler:** `DepartmentController.getDepartment()`

### `Endpoint` — GET /api/v1/department/salary/{minSalary}

- **id:** `GET /api/v1/department/salary/{minSalary}`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `department-service`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:39`
- **Signature:** `List<DepartmentResponse> getAllDepartments(double minSalary)`
- **Handler:** `DepartmentController.getAllDepartments()`

### `Endpoint` — GET /api/v1/employee

- **id:** `GET /api/v1/employee`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `sheduler-service`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/controller/EmployeeSchedulerController.java:18`
- **Signature:** `List<Employee> getAllEmployees()`
- **Handler:** `EmployeeSchedulerController.getAllEmployees()`

### `Endpoint` — GET /api/v1/employee/{id}

- **id:** `GET /api/v1/employee/{id}`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:61`
- **Signature:** `ResponseEntity<StandardResponse> getEmployee(String employeeId)`
- **Handler:** `EmployeeController.getEmployee()`

### `Endpoint` — GET /api/v1/employee/salary/{id}

- **id:** `GET /api/v1/employee/salary/{id}`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:71`
- **Signature:** `CompletableFuture<ResponseEntity<StandardResponse>> getEmployeeSalary(String employeeId)`
- **Handler:** `EmployeeController.getEmployeeSalary()`

### `Endpoint` — GET /api/v1/employee/search

- **id:** `GET /api/v1/employee/search`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:50`
- **Signature:** `ResponseEntity<StandardResponse> searchEmployees(String name, String department)`
- **Handler:** `EmployeeController.searchEmployees()`

### `Endpoint` — GET /api/v1/export

- **id:** `GET /api/v1/export`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `report-service`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/controller/EmployeeReportController.java:25`
- **Signature:** `void exportToExcel(HttpServletResponse response)`
- **Handler:** `EmployeeReportController.exportToExcel()`

### `ExternalType` — MongoRepository

- **id:** `MongoRepository`
- **status:** NEW
- **selected because:** framework base type behind 4 in-repo type(s)
- **Implementors:** `EmployeeSchedulerRepository`, `EmployeeReportRepository`, `EmployeeRepository`, `DepartmentRepository`

### `Endpoint` — POST /api/v1/department

- **id:** `POST /api/v1/department`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `department-service`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:23`
- **Signature:** `ResponseEntity<StandardResponse> createDepartment(Department department)`
- **Handler:** `DepartmentController.createDepartment()`

### `Endpoint` — POST /api/v1/employee

- **id:** `POST /api/v1/employee`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:31`
- **Signature:** `ResponseEntity<StandardResponse> createEmployee(Employee employee)`
- **Handler:** `EmployeeController.createEmployee()`

### `Endpoint` — POST /api/v1/employee/excelUpload

- **id:** `POST /api/v1/employee/excelUpload`
- **status:** NEW
- **selected because:** externally reachable entry point
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:41`
- **Signature:** `ResponseEntity<StandardResponse> uploadEmployee(MultipartFile multipartFile)`
- **Handler:** `EmployeeController.uploadEmployee()`

### `Type` — DepartmentController

- **id:** `com.aura.vihanga.departmentservice.controller.DepartmentController`
- **status:** NEW
- **selected because:** @RestController stereotype; exposes 3 REST endpoint(s); injects 1 in-repo collaborator(s)
- **Module:** `department-service`
- **Package:** `com.aura.vihanga.departmentservice.controller`
- **Kind:** `class`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:15`
- **Annotations:** `@RestController`, `@RequestMapping`, `@Slf4j`
- **Injected fields:** `DepartmentService departmentService`
- **Methods:** `ResponseEntity<StandardResponse> createDepartment(Department department)`, `DepartmentResponse getDepartment(String departmentId)`, `List<DepartmentResponse> getAllDepartments(double minSalary)`
- **REST endpoints:** `POST /api/v1/department`, `GET /api/v1/department/{id}`, `GET /api/v1/department/salary/{minSalary}`

### `Type` — EmployeeController

- **id:** `com.aura.vihanga.employeeservice.controller.EmployeeController`
- **status:** NEW
- **selected because:** @RestController stereotype; exposes 5 REST endpoint(s); injects 1 in-repo collaborator(s)
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.controller`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:23`
- **Annotations:** `@RestController`, `@RequestMapping`, `@Slf4j`
- **Injected fields:** `EmployeeService employeeService`
- **Methods:** `ResponseEntity<StandardResponse> createEmployee(Employee employee)`, `ResponseEntity<StandardResponse> uploadEmployee(MultipartFile multipartFile)`, `ResponseEntity<StandardResponse> searchEmployees(String name, String department)`, `ResponseEntity<StandardResponse> getEmployee(String employeeId)`, `CompletableFuture<ResponseEntity<StandardResponse>> getEmployeeSalary(String employeeId)`, `CompletableFuture<ResponseEntity<StandardResponse>> fallBackMethodEmployee(String employeeId, RuntimeException runtimeException)`
- **REST endpoints:** `POST /api/v1/employee`, `POST /api/v1/employee/excelUpload`, `GET /api/v1/employee/search`, `GET /api/v1/employee/{id}`, `GET /api/v1/employee/salary/{id}`

### `Type` — EmployeeReportController

- **id:** `com.aura.vihanga.reportservice.controller.EmployeeReportController`
- **status:** NEW
- **selected because:** @RestController stereotype; exposes 1 REST endpoint(s); injects 1 in-repo collaborator(s)
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.controller`
- **Kind:** `class`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/controller/EmployeeReportController.java:17`
- **Annotations:** `@RestController`, `@RequestMapping`, `@Slf4j`
- **Injected fields:** `EmployeeReportService reportService`
- **Methods:** `void exportToExcel(HttpServletResponse response)`
- **REST endpoints:** `GET /api/v1/export`

### `Type` — EmployeeSchedulerController

- **id:** `com.aura.vihanga.shedulerservice.controller.EmployeeSchedulerController`
- **status:** NEW
- **selected because:** @RestController stereotype; exposes 1 REST endpoint(s); injects 1 in-repo collaborator(s)
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice.controller`
- **Kind:** `class`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/controller/EmployeeSchedulerController.java:12`
- **Annotations:** `@RestController`, `@RequestMapping`
- **Injected fields:** `EmployeeSchedulerService schedulerService`
- **Methods:** `List<Employee> getAllEmployees()`
- **REST endpoints:** `GET /api/v1/employee`

### `Type` — DepartmentRepository

- **id:** `com.aura.vihanga.departmentservice.repository.DepartmentRepository`
- **status:** NEW
- **selected because:** @Repository stereotype; extends framework type(s): MongoRepository
- **Module:** `department-service`
- **Package:** `com.aura.vihanga.departmentservice.repository`
- **Kind:** `interface`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/repository/DepartmentRepository.java:9`
- **Annotations:** `@Repository`
- **Extends / implements:** `MongoRepository`
- **Methods:** `List<Department> findBySalaryGreaterThan(double minSalary)`
- **Depended on by:** 1 type(s)

### `Type` — EmployeeAdvice

- **id:** `com.aura.vihanga.employeeservice.advice.EmployeeAdvice`
- **status:** NEW
- **selected because:** @RestControllerAdvice stereotype; extends framework type(s): ResponseEntityExceptionHandler
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.advice`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/advice/EmployeeAdvice.java:15`
- **Annotations:** `@RestControllerAdvice`
- **Extends / implements:** `ResponseEntityExceptionHandler`
- **Methods:** `ResponseEntity<Object> handleHttpRequestMethodNotSupported(HttpRequestMethodNotSupportedException ex, HttpHeaders headers, HttpStatus status, WebRequest request)`, `ResponseEntity<StandardResponse> handleEmployeeNotFoundException(EmployeeNotFoundException employeeNotFoundException)`

### `Package` — com.aura.vihanga.employeeservice.config

- **id:** `com.aura.vihanga.employeeservice.config`
- **status:** NEW
- **selected because:** groups 2 types
- **Module:** `employee-service`
- **Types in package:** `WebClientConfig (class)`, `DepartmentUrlConfiguration (class)`

### `Package` — com.aura.vihanga.employeeservice.dto

- **id:** `com.aura.vihanga.employeeservice.dto`
- **status:** NEW
- **selected because:** groups 3 types
- **Module:** `employee-service`
- **Types in package:** `EmployeeSalaryResponse (class)`, `EmployeeResponse (class)`, `DepartmentResponse (class)`

### `Type` — EmployeeServiceApplication

- **id:** `com.aura.vihanga.employeeservice.EmployeeServiceApplication`
- **status:** NEW
- **selected because:** @SpringBootApplication stereotype; extends framework type(s): SpringBootServletInitializer
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/EmployeeServiceApplication.java:9`
- **Annotations:** `@SpringBootApplication`, `@EnableEurekaClient`
- **Extends / implements:** `SpringBootServletInitializer`
- **Methods:** `void main(String[] args)`, `SpringApplicationBuilder configure(SpringApplicationBuilder builder)`

### `Package` — com.aura.vihanga.employeeservice.repository

- **id:** `com.aura.vihanga.employeeservice.repository`
- **status:** NEW
- **selected because:** groups 2 types
- **Module:** `employee-service`
- **Types in package:** `EmployeeSearchRepository (class)`, `EmployeeRepository (interface)`

### `Type` — EmployeeRepository

- **id:** `com.aura.vihanga.employeeservice.repository.EmployeeRepository`
- **status:** NEW
- **selected because:** @Repository stereotype; extends framework type(s): MongoRepository
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.repository`
- **Kind:** `interface`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/repository/EmployeeRepository.java:7`
- **Annotations:** `@Repository`
- **Extends / implements:** `MongoRepository`
- **Depended on by:** 1 type(s)

### `Package` — com.aura.vihanga.employeeservice.service.implementation

- **id:** `com.aura.vihanga.employeeservice.service.implementation`
- **status:** NEW
- **selected because:** groups 2 types
- **Module:** `employee-service`
- **Types in package:** `ExcelUploadImpl (class)`, `EmployeeServiceImpl (class)`

### `Type` — EmployeeServiceImpl

- **id:** `com.aura.vihanga.employeeservice.service.implementation.EmployeeServiceImpl`
- **status:** NEW
- **selected because:** @Service stereotype; holds HTTP client field(s): builder; injects 3 in-repo collaborator(s)
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.service.implementation`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/service/implementation/EmployeeServiceImpl.java:24`
- **Annotations:** `@Service`, `@Slf4j`
- **Extends / implements:** `EmployeeService`
- **Injected fields:** `EmployeeRepository employeeRepository`, `EmployeeSearchRepository employeeSearchRepository`, `WebClient.Builder builder`, `DepartmentUrlConfiguration departmentUrlConfiguration`
- **Methods:** `EmployeeResponse createEmployee(Employee employee)`, `EmployeeResponse getEmployee(String employeeId)`, `EmployeeSalaryResponse getEmployeeSalary(String employeeId)`, `List<EmployeeResponse> searchEmployees(String name, String department)`, `void uploadEmployee(MultipartFile multipartFile)`

### `Package` — com.aura.vihanga.employeeservice.utill

- **id:** `com.aura.vihanga.employeeservice.utill`
- **status:** NEW
- **selected because:** groups 3 types
- **Module:** `employee-service`
- **Types in package:** `StandardResponse (class)`, `GenderType (enum)`, `EmployeeType (enum)`

### `Package` — com.aura.vihanga.reportservice.config

- **id:** `com.aura.vihanga.reportservice.config`
- **status:** NEW
- **selected because:** groups 2 types
- **Module:** `report-service`
- **Types in package:** `WebClientConfig (class)`, `DepartmentConfigUrl (class)`

### `Method` — EmployeeReportController.exportToExcel()

- **id:** `com.aura.vihanga.reportservice.controller.EmployeeReportController#exportToExcel(HttpServletResponse)`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/export; orchestrates 2 downstream call(s)
- **Module:** `report-service`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/controller/EmployeeReportController.java:25-39`
- **Signature:** `void exportToExcel(HttpServletResponse response)`
- **Owner:** `EmployeeReportController`
- **Annotations:** `@GetMapping`
- **Endpoint:** `GET /api/v1/export`
- **Calls:** `com.aura.vihanga.reportservice.service.EmployeeReportService#getEmployees()`, `com.aura.vihanga.reportservice.service.EmployeeReportService#generateExcelFile(List<EmployeeSalaryResponse>)`

```java
@GetMapping("export")
    public void exportToExcel(HttpServletResponse response) throws IOException {
        List<EmployeeSalaryResponse> employeeSalaryResponseList = reportService.getEmployees();

//        List<Employee> employees = new ArrayList<>();
//
        byte[] excelBytes = reportService.generateExcelFile(employeeSalaryResponseList);

        response.setContentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        response.setHeader("Content-Disposition", "attachment; filename=employees.xlsx");
        response.getOutputStream().write(excelBytes);
        response.getOutputStream().flush();

        log.info("Report Controller");
    }
```

### `Package` — com.aura.vihanga.reportservice.dto

- **id:** `com.aura.vihanga.reportservice.dto`
- **status:** NEW
- **selected because:** groups 3 types
- **Module:** `report-service`
- **Types in package:** `EmployeeSalaryResponse (class)`, `EmployeeResponse (class)`, `DepartmentResponse (class)`

### `Type` — EmployeeReportRepository

- **id:** `com.aura.vihanga.reportservice.repository.EmployeeReportRepository`
- **status:** NEW
- **selected because:** @Repository stereotype; extends framework type(s): MongoRepository
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.repository`
- **Kind:** `interface`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/repository/EmployeeReportRepository.java:7`
- **Annotations:** `@Repository`
- **Extends / implements:** `MongoRepository`
- **Methods:** `List<Employee> findByDepartment(String department)`
- **Depended on by:** 1 type(s)

### `Type` — EmployeeReportServiceImpl

- **id:** `com.aura.vihanga.reportservice.service.implementation.EmployeeReportServiceImpl`
- **status:** NEW
- **selected because:** @Service stereotype; holds HTTP client field(s): builder; injects 2 in-repo collaborator(s)
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.service.implementation`
- **Kind:** `class`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/service/implementation/EmployeeReportServiceImpl.java:27`
- **Annotations:** `@Service`, `@Slf4j`
- **Extends / implements:** `EmployeeReportService`
- **Injected fields:** `EmployeeReportRepository employeeReportRepository`, `WebClient.Builder builder`, `DepartmentConfigUrl departmentConfigUrl`
- **Methods:** `List<EmployeeSalaryResponse> getEmployees()`, `byte[] generateExcelFile(List<EmployeeSalaryResponse> employees)`

### `Package` — com.aura.vihanga.reportservice.utill

- **id:** `com.aura.vihanga.reportservice.utill`
- **status:** NEW
- **selected because:** groups 3 types
- **Module:** `report-service`
- **Types in package:** `StandardResponse (class)`, `GenderType (enum)`, `EmployeeType (enum)`

### `Package` — com.aura.vihanga.shedulerservice.service.implementation

- **id:** `com.aura.vihanga.shedulerservice.service.implementation`
- **status:** NEW
- **selected because:** groups 2 types
- **Module:** `sheduler-service`
- **Types in package:** `WomenDaySchedulerImpl (class)`, `EmployeeSchedulerServiceImpl (class)`

### `Type` — WomenDaySchedulerImpl

- **id:** `com.aura.vihanga.shedulerservice.service.implementation.WomenDaySchedulerImpl`
- **status:** NEW
- **selected because:** @Service stereotype; runs 1 scheduled job(s); injects 1 in-repo collaborator(s)
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice.service.implementation`
- **Kind:** `class`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/service/implementation/WomenDaySchedulerImpl.java:13`
- **Annotations:** `@Service`
- **Injected fields:** `EmployeeSchedulerService employeeSchedulerService`
- **Methods:** `void printWomenDayMessage()`

### `Package` — com.aura.vihanga.shedulerservice.utill

- **id:** `com.aura.vihanga.shedulerservice.utill`
- **status:** NEW
- **selected because:** groups 2 types
- **Module:** `sheduler-service`
- **Types in package:** `GenderType (enum)`, `EmployeeType (enum)`

### `ExternalType` — Exception

- **id:** `Exception`
- **status:** NEW
- **selected because:** framework base type behind 1 in-repo type(s)
- **Implementors:** `EmployeeNotFoundException`

### `ExternalType` — ResponseEntityExceptionHandler

- **id:** `ResponseEntityExceptionHandler`
- **status:** NEW
- **selected because:** framework base type behind 1 in-repo type(s)
- **Implementors:** `EmployeeAdvice`

### `ExternalType` — SpringBootServletInitializer

- **id:** `SpringBootServletInitializer`
- **status:** NEW
- **selected because:** framework base type behind 1 in-repo type(s)
- **Implementors:** `EmployeeServiceApplication`

### `Method` — EmployeeServiceImpl.getEmployeeSalary()

- **id:** `com.aura.vihanga.employeeservice.service.implementation.EmployeeServiceImpl#getEmployeeSalary(String)`
- **status:** NEW
- **selected because:** orchestrates 2 downstream call(s); makes an outbound HTTP call; 20 lines of logic
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/service/implementation/EmployeeServiceImpl.java:86-106`
- **Signature:** `EmployeeSalaryResponse getEmployeeSalary(String employeeId)`
- **Owner:** `EmployeeServiceImpl`
- **Annotations:** `@Override`
- **Calls:** `com.aura.vihanga.employeeservice.service.implementation.EmployeeServiceImpl#getEmployee(String)`, `com.aura.vihanga.employeeservice.config.DepartmentUrlConfiguration#getDepartmentByIdUrl()`

```java
@Override
    public EmployeeSalaryResponse getEmployeeSalary(String employeeId) throws EmployeeNotFoundException {
        log.trace("EmployeeServiceImpl - getEmployeeSalary - employeeId {}", employeeId);
        EmployeeResponse employeeResponse = getEmployee(employeeId);
        String departmentId = employeeResponse.getDepartment();

        DepartmentResponse departmentResponse = builder.build().get()
                .uri(departmentUrlConfiguration.getDepartmentByIdUrl(), departmentId)
                .retrieve()
                .bodyToMono(DepartmentResponse.class)
                .block();

        EmployeeSalaryResponse employeeSalaryResponse = EmployeeSalaryResponse.builder()
                .employeeId(employeeResponse.getEmployeeId())
                .name(employeeResponse.getName())
                .departmentName(departmentResponse.getDepartmentName())
                .salary(departmentResponse.getSalary())
                .build();

        return employeeSalaryResponse;
    }
```

### `Type` — EmployeeSchedulerService

- **id:** `com.aura.vihanga.shedulerservice.service.EmployeeSchedulerService`
- **status:** NEW
- **selected because:** 2 type(s) depend on it; contract implemented by EmployeeSchedulerServiceImpl
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice.service`
- **Kind:** `interface`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/service/EmployeeSchedulerService.java:7`
- **Implemented by:** `EmployeeSchedulerServiceImpl`
- **Methods:** `List<Employee> getAllEmployees()`
- **Depended on by:** 2 type(s)

### `Method` — DepartmentController.createDepartment()

- **id:** `com.aura.vihanga.departmentservice.controller.DepartmentController#createDepartment(Department)`
- **status:** NEW
- **selected because:** REST entry point POST /api/v1/department
- **Module:** `department-service`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:23-32`
- **Signature:** `ResponseEntity<StandardResponse> createDepartment(Department department)`
- **Owner:** `DepartmentController`
- **Annotations:** `@PostMapping`
- **Endpoint:** `POST /api/v1/department`
- **Calls:** `com.aura.vihanga.departmentservice.controller.DepartmentController#createDepartment(Department)`
- **Called by:** `com.aura.vihanga.departmentservice.controller.DepartmentController#createDepartment(Department)`

```java
@PostMapping("department")
    public ResponseEntity<StandardResponse> createDepartment(@RequestBody Department department) {
        DepartmentResponse departmentResponse = createDepartment(department);

        return new ResponseEntity<StandardResponse>(
                new StandardResponse(201, "Department Created Successfully", departmentResponse), HttpStatus.CREATED
        );


    }
```

### `Method` — DepartmentController.getAllDepartments()

- **id:** `com.aura.vihanga.departmentservice.controller.DepartmentController#getAllDepartments(double)`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/department/salary/{minSalary}
- **Module:** `department-service`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:39-44`
- **Signature:** `List<DepartmentResponse> getAllDepartments(double minSalary)`
- **Owner:** `DepartmentController`
- **Annotations:** `@GetMapping`
- **Endpoint:** `GET /api/v1/department/salary/{minSalary}`
- **Calls:** `com.aura.vihanga.departmentservice.service.DepartmentService#getAllDepartments(double)`

```java
@GetMapping("department/salary/{minSalary}")
    public List<DepartmentResponse> getAllDepartments(@PathVariable("minSalary") double minSalary) {
        List<DepartmentResponse> departmentResponses = departmentService.getAllDepartments(minSalary);
        log.info("Department Controller {}", departmentResponses);
        return  departmentResponses;
    }
```

### `Method` — DepartmentController.getDepartment()

- **id:** `com.aura.vihanga.departmentservice.controller.DepartmentController#getDepartment(String)`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/department/{id}
- **Module:** `department-service`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/controller/DepartmentController.java:34-37`
- **Signature:** `DepartmentResponse getDepartment(String departmentId)`
- **Owner:** `DepartmentController`
- **Annotations:** `@GetMapping`
- **Endpoint:** `GET /api/v1/department/{id}`
- **Calls:** `com.aura.vihanga.departmentservice.service.DepartmentService#getDepartment(String)`

```java
@GetMapping("department/{id}")
    public DepartmentResponse getDepartment(@PathVariable("id") String departmentId) {
        return departmentService.getDepartment(departmentId);
    }
```

### `Type` — DepartmentServiceImpl

- **id:** `com.aura.vihanga.departmentservice.service.implementation.DepartmentServiceImpl`
- **status:** NEW
- **selected because:** @Service stereotype; injects 1 in-repo collaborator(s)
- **Module:** `department-service`
- **Package:** `com.aura.vihanga.departmentservice.service.implementation`
- **Kind:** `class`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/service/implementation/DepartmentServiceImpl.java:17`
- **Annotations:** `@Service`, `@Slf4j`
- **Extends / implements:** `DepartmentService`
- **Injected fields:** `DepartmentRepository departmentRepository`
- **Methods:** `DepartmentResponse createDepartment(Department department)`, `List<DepartmentResponse> getAllDepartments(double minSalary)`, `DepartmentResponse getDepartment(String departmentId)`

### `Method` — EmployeeController.createEmployee()

- **id:** `com.aura.vihanga.employeeservice.controller.EmployeeController#createEmployee(Employee)`
- **status:** NEW
- **selected because:** REST entry point POST /api/v1/employee
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:31-39`
- **Signature:** `ResponseEntity<StandardResponse> createEmployee(Employee employee)`
- **Owner:** `EmployeeController`
- **Annotations:** `@PostMapping`
- **Endpoint:** `POST /api/v1/employee`
- **Calls:** `com.aura.vihanga.employeeservice.service.EmployeeService#createEmployee(Employee)`

```java
@PostMapping("employee")
    public ResponseEntity<StandardResponse> createEmployee(@RequestBody Employee employee) {
        log.trace("EmployeeController - createEmployee - employee {}", employee);
        EmployeeResponse employeeResponse = employeeService.createEmployee(employee);

        return new ResponseEntity<StandardResponse>(
                new StandardResponse(201, "Employee Created Successfully", employeeResponse), HttpStatus.CREATED
        );
    }
```

### `Method` — EmployeeController.getEmployee()

- **id:** `com.aura.vihanga.employeeservice.controller.EmployeeController#getEmployee(String)`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/employee/{id}
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:61-69`
- **Signature:** `ResponseEntity<StandardResponse> getEmployee(String employeeId)`
- **Owner:** `EmployeeController`
- **Annotations:** `@GetMapping`
- **Endpoint:** `GET /api/v1/employee/{id}`
- **Calls:** `com.aura.vihanga.employeeservice.service.EmployeeService#getEmployee(String)`

```java
@GetMapping("employee/{id}")
    public ResponseEntity<StandardResponse> getEmployee(@PathVariable("id") String employeeId) throws EmployeeNotFoundException {
        log.trace("EmployeeController - getEmployee - employeeId {}", employeeId);
        EmployeeResponse employeeResponse = employeeService.getEmployee(employeeId);

        return new ResponseEntity<StandardResponse>(
                new StandardResponse(200, "Employee Fetch Successfully", employeeResponse), HttpStatus.OK
        );
    }
```

### `Method` — EmployeeController.getEmployeeSalary()

- **id:** `com.aura.vihanga.employeeservice.controller.EmployeeController#getEmployeeSalary(String)`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/employee/salary/{id}
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:71-82`
- **Signature:** `CompletableFuture<ResponseEntity<StandardResponse>> getEmployeeSalary(String employeeId)`
- **Owner:** `EmployeeController`
- **Annotations:** `@GetMapping`, `@CircuitBreaker`, `@TimeLimiter`, `@Retry`
- **Endpoint:** `GET /api/v1/employee/salary/{id}`
- **Calls:** `com.aura.vihanga.employeeservice.service.EmployeeService#getEmployeeSalary(String)`

```java
@GetMapping("employee/salary/{id}")
    @CircuitBreaker(name = "employee", fallbackMethod = "fallBackMethodEmployee")
    @TimeLimiter(name = "employee")
    @Retry(name="employee")
    public CompletableFuture<ResponseEntity<StandardResponse>> getEmployeeSalary(@PathVariable("id") String employeeId) throws EmployeeNotFoundException {
        log.trace("EmployeeController - getEmployeeSalary - employeeId {}", employeeId);
        EmployeeSalaryResponse employeeSalaryResponse = employeeService.getEmployeeSalary(employeeId);

        return CompletableFuture.supplyAsync(() -> new ResponseEntity<StandardResponse>(
                new StandardResponse(200, "Employee Salary Fetch Successfully", employeeSalaryResponse), HttpStatus.OK
        ));
    }
```

### `Method` — EmployeeController.searchEmployees()

- **id:** `com.aura.vihanga.employeeservice.controller.EmployeeController#searchEmployees(String,String)`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/employee/search
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:50-59`
- **Signature:** `ResponseEntity<StandardResponse> searchEmployees(String name, String department)`
- **Owner:** `EmployeeController`
- **Annotations:** `@GetMapping`
- **Endpoint:** `GET /api/v1/employee/search`
- **Calls:** `com.aura.vihanga.employeeservice.service.EmployeeService#searchEmployees(String,String)`

```java
@GetMapping("employee/search")
    public ResponseEntity<StandardResponse> searchEmployees(@RequestParam("name") String name,
                                                            @RequestParam(value = "department", required = false) String department) {
        log.trace("EmployeeController - searchEmployees - name {} department {}", name, department);
        List<EmployeeResponse> employeeResponses = employeeService.searchEmployees(name, department);

        return new ResponseEntity<StandardResponse>(
                new StandardResponse(200, "Employee Search Completed Successfully", employeeResponses), HttpStatus.OK
        );
    }
```

### `Method` — EmployeeController.uploadEmployee()

- **id:** `com.aura.vihanga.employeeservice.controller.EmployeeController#uploadEmployee(MultipartFile)`
- **status:** NEW
- **selected because:** REST entry point POST /api/v1/employee/excelUpload
- **Module:** `employee-service`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/controller/EmployeeController.java:41-48`
- **Signature:** `ResponseEntity<StandardResponse> uploadEmployee(MultipartFile multipartFile)`
- **Owner:** `EmployeeController`
- **Annotations:** `@PostMapping`
- **Endpoint:** `POST /api/v1/employee/excelUpload`
- **Calls:** `com.aura.vihanga.employeeservice.service.EmployeeService#uploadEmployee(MultipartFile)`

```java
@PostMapping("employee/excelUpload")
    public ResponseEntity<StandardResponse> uploadEmployee(@RequestParam("file") MultipartFile multipartFile) throws IOException {
        employeeService.uploadEmployee(multipartFile);

        return new ResponseEntity<StandardResponse>(
                new StandardResponse(201, "File Upload Successfully", null), HttpStatus.OK
        );
    }
```

### `Type` — Employee

- **id:** `com.aura.vihanga.employeeservice.model.Employee`
- **status:** NEW
- **selected because:** @Document stereotype; injects 2 in-repo collaborator(s)
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.model`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/model/Employee.java:12`
- **Annotations:** `@Document`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@Data`, `@Builder`
- **Injected fields:** `String employeeId`, `String name`, `String department`, `String phoneNo`, `String address`, `GenderType gender`, `EmployeeType employeeType`

### `Type` — Employee

- **id:** `com.aura.vihanga.reportservice.entity.Employee`
- **status:** NEW
- **selected because:** @Document stereotype; injects 2 in-repo collaborator(s)
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.entity`
- **Kind:** `class`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/entity/Employee.java:12`
- **Annotations:** `@Document`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@Data`, `@Builder`
- **Injected fields:** `String employeeId`, `String name`, `String department`, `String phoneNo`, `String address`, `GenderType gender`, `EmployeeType employeeType`

### `Method` — EmployeeSchedulerController.getAllEmployees()

- **id:** `com.aura.vihanga.shedulerservice.controller.EmployeeSchedulerController#getAllEmployees()`
- **status:** NEW
- **selected because:** REST entry point GET /api/v1/employee
- **Module:** `sheduler-service`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/controller/EmployeeSchedulerController.java:18-21`
- **Signature:** `List<Employee> getAllEmployees()`
- **Owner:** `EmployeeSchedulerController`
- **Annotations:** `@GetMapping`
- **Endpoint:** `GET /api/v1/employee`
- **Calls:** `com.aura.vihanga.shedulerservice.service.EmployeeSchedulerService#getAllEmployees()`

```java
@GetMapping("employee")
    public List<Employee> getAllEmployees() {
        return schedulerService.getAllEmployees();
    }
```

### `Type` — Employee

- **id:** `com.aura.vihanga.shedulerservice.entity.Employee`
- **status:** NEW
- **selected because:** @Document stereotype; injects 2 in-repo collaborator(s)
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice.entity`
- **Kind:** `class`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/entity/Employee.java:12`
- **Annotations:** `@Document`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@Data`, `@Builder`
- **Injected fields:** `String employeeId`, `String name`, `String department`, `String phoneNo`, `String address`, `GenderType gender`, `EmployeeType employeeType`

### `Type` — EmployeeSchedulerServiceImpl

- **id:** `com.aura.vihanga.shedulerservice.service.implementation.EmployeeSchedulerServiceImpl`
- **status:** NEW
- **selected because:** @Service stereotype; injects 1 in-repo collaborator(s)
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice.service.implementation`
- **Kind:** `class`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/service/implementation/EmployeeSchedulerServiceImpl.java:11`
- **Annotations:** `@Service`
- **Extends / implements:** `EmployeeSchedulerService`
- **Injected fields:** `EmployeeSchedulerRepository employeeSchedulerRepository`
- **Methods:** `List<Employee> getAllEmployees()`

### `Method` — WomenDaySchedulerImpl.printWomenDayMessage()

- **id:** `com.aura.vihanga.shedulerservice.service.implementation.WomenDaySchedulerImpl#printWomenDayMessage()`
- **status:** NEW
- **selected because:** scheduled job (0 0 0 8 3 *)
- **Module:** `sheduler-service`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/service/implementation/WomenDaySchedulerImpl.java:19-29`
- **Signature:** `void printWomenDayMessage()`
- **Owner:** `WomenDaySchedulerImpl`
- **Annotations:** `@Scheduled`
- **Calls:** `com.aura.vihanga.shedulerservice.service.EmployeeSchedulerService#getAllEmployees()`

```java
@Scheduled(cron = "0 0 0 8 3 *")
    public void printWomenDayMessage() {
        List<Employee> womenEmployees = employeeSchedulerService.getAllEmployees().stream()
                .filter(employee -> employee.getGender() == GenderType.FEMALE)
                .collect(Collectors.toList());

        System.out.println("Happy Women's Day!");
        for (Employee employee : womenEmployees) {
            System.out.println("Employee Name: " + employee.getName());
        }
    }
```

### `Type` — ConfiguarationServerApplication

- **id:** `com.aura.vihanga.configuarationserver.ConfiguarationServerApplication`
- **status:** NEW
- **selected because:** @SpringBootApplication stereotype
- **Module:** `configuaration-server`
- **Package:** `com.aura.vihanga.configuarationserver`
- **Kind:** `class`
- **Location:** `configuaration-server/src/main/java/com/aura/vihanga/configuarationserver/ConfiguarationServerApplication.java:8`
- **Annotations:** `@SpringBootApplication`, `@EnableEurekaClient`, `@EnableConfigServer`
- **Methods:** `void main(String[] args)`

### `Type` — DepartmentServiceApplication

- **id:** `com.aura.vihanga.departmentservice.DepartmentServiceApplication`
- **status:** NEW
- **selected because:** @SpringBootApplication stereotype
- **Module:** `department-service`
- **Package:** `com.aura.vihanga.departmentservice`
- **Kind:** `class`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/DepartmentServiceApplication.java:7`
- **Annotations:** `@SpringBootApplication`, `@EnableEurekaClient`
- **Methods:** `void main(String[] args)`

### `Type` — Department

- **id:** `com.aura.vihanga.departmentservice.model.Department`
- **status:** NEW
- **selected because:** @Document stereotype
- **Module:** `department-service`
- **Package:** `com.aura.vihanga.departmentservice.model`
- **Kind:** `class`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/model/Department.java:10`
- **Annotations:** `@Document`, `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor`, `@Builder`
- **Injected fields:** `String departmentId`, `String departmentName`, `double salary`

### `Type` — DepartmentService

- **id:** `com.aura.vihanga.departmentservice.service.DepartmentService`
- **status:** NEW
- **selected because:** contract implemented by DepartmentServiceImpl
- **Module:** `department-service`
- **Package:** `com.aura.vihanga.departmentservice.service`
- **Kind:** `interface`
- **Location:** `department-service/src/main/java/com/aura/vihanga/departmentservice/service/DepartmentService.java:8`
- **Implemented by:** `DepartmentServiceImpl`
- **Methods:** `DepartmentResponse getDepartment(String departmentId)`, `DepartmentResponse createDepartment(Department department)`, `List<DepartmentResponse> getAllDepartments(double minSalary)`
- **Depended on by:** 1 type(s)

### `Type` — DiscoveryServiceApplication

- **id:** `com.aura.vihanga.discoveryservice.DiscoveryServiceApplication`
- **status:** NEW
- **selected because:** @SpringBootApplication stereotype
- **Module:** `discovery-service`
- **Package:** `com.aura.vihanga.discoveryservice`
- **Kind:** `class`
- **Location:** `discovery-service/src/main/java/com/aura/vihanga/discoveryservice/DiscoveryServiceApplication.java:7`
- **Annotations:** `@SpringBootApplication`, `@EnableEurekaServer`
- **Methods:** `void main(String[] args)`

### `Type` — DepartmentUrlConfiguration

- **id:** `com.aura.vihanga.employeeservice.config.DepartmentUrlConfiguration`
- **status:** NEW
- **selected because:** @Component stereotype
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.config`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/config/DepartmentUrlConfiguration.java:7`
- **Annotations:** `@Component`
- **Injected fields:** `Environment environment`
- **Methods:** `String getDepartmentByIdUrl()`
- **Depended on by:** 1 type(s)

### `Type` — WebClientConfig

- **id:** `com.aura.vihanga.employeeservice.config.WebClientConfig`
- **status:** NEW
- **selected because:** @Configuration stereotype
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.config`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/config/WebClientConfig.java:9`
- **Annotations:** `@Configuration`
- **Methods:** `WebClient.Builder webClient()`

### `Type` — EmployeeNotFoundException

- **id:** `com.aura.vihanga.employeeservice.exception.EmployeeNotFoundException`
- **status:** NEW
- **selected because:** extends framework type(s): Exception
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.exception`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/exception/EmployeeNotFoundException.java:3`
- **Extends / implements:** `Exception`
- **Methods:** `void EmployeeNotFoundException()`, `void EmployeeNotFoundException(String message)`, `void EmployeeNotFoundException(String message, Throwable cause)`, `void EmployeeNotFoundException(Throwable cause)`, `void EmployeeNotFoundException(String message, Throwable cause, boolean enableSuppression, boolean writableStackTrace)`

### `Type` — EmployeeSearchRepository

- **id:** `com.aura.vihanga.employeeservice.repository.EmployeeSearchRepository`
- **status:** NEW
- **selected because:** @Repository stereotype
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.repository`
- **Kind:** `class`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/repository/EmployeeSearchRepository.java:12`
- **Annotations:** `@Repository`, `@Slf4j`
- **Injected fields:** `MongoTemplate mongoTemplate`
- **Methods:** `List<Employee> searchEmployees(String name, String department)`
- **Depended on by:** 1 type(s)

### `Type` — EmployeeService

- **id:** `com.aura.vihanga.employeeservice.service.EmployeeService`
- **status:** NEW
- **selected because:** contract implemented by EmployeeServiceImpl
- **Module:** `employee-service`
- **Package:** `com.aura.vihanga.employeeservice.service`
- **Kind:** `interface`
- **Location:** `employee-service/src/main/java/com/aura/vihanga/employeeservice/service/EmployeeService.java:13`
- **Implemented by:** `EmployeeServiceImpl`
- **Methods:** `EmployeeResponse createEmployee(Employee employee)`, `EmployeeResponse getEmployee(String employeeId)`, `EmployeeSalaryResponse getEmployeeSalary(String employeeId)`, `void uploadEmployee(MultipartFile multipartFile)`, `List<EmployeeResponse> searchEmployees(String name, String department)`
- **Depended on by:** 1 type(s)

### `Type` — DepartmentConfigUrl

- **id:** `com.aura.vihanga.reportservice.config.DepartmentConfigUrl`
- **status:** NEW
- **selected because:** @Component stereotype
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.config`
- **Kind:** `class`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/config/DepartmentConfigUrl.java:7`
- **Annotations:** `@Component`
- **Injected fields:** `Environment environment`
- **Methods:** `String getDepartmentUrl()`
- **Depended on by:** 1 type(s)

### `Type` — WebClientConfig

- **id:** `com.aura.vihanga.reportservice.config.WebClientConfig`
- **status:** NEW
- **selected because:** @Configuration stereotype
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.config`
- **Kind:** `class`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/config/WebClientConfig.java:9`
- **Annotations:** `@Configuration`
- **Methods:** `WebClient.Builder webClientBuilder()`

### `Type` — ReportServiceApplication

- **id:** `com.aura.vihanga.reportservice.ReportServiceApplication`
- **status:** NEW
- **selected because:** @SpringBootApplication stereotype
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice`
- **Kind:** `class`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/ReportServiceApplication.java:7`
- **Annotations:** `@SpringBootApplication`, `@EnableEurekaClient`
- **Methods:** `void main(String[] args)`

### `Type` — EmployeeReportService

- **id:** `com.aura.vihanga.reportservice.service.EmployeeReportService`
- **status:** NEW
- **selected because:** contract implemented by EmployeeReportServiceImpl
- **Module:** `report-service`
- **Package:** `com.aura.vihanga.reportservice.service`
- **Kind:** `interface`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/service/EmployeeReportService.java:10`
- **Implemented by:** `EmployeeReportServiceImpl`
- **Methods:** `List<EmployeeSalaryResponse> getEmployees()`, `byte[] generateExcelFile(List<EmployeeSalaryResponse> employees)`
- **Depended on by:** 1 type(s)

### `Method` — EmployeeReportServiceImpl.getEmployees()

- **id:** `com.aura.vihanga.reportservice.service.implementation.EmployeeReportServiceImpl#getEmployees()`
- **status:** NEW
- **selected because:** makes an outbound HTTP call; 34 lines of logic
- **Module:** `report-service`
- **Location:** `report-service/src/main/java/com/aura/vihanga/reportservice/service/implementation/EmployeeReportServiceImpl.java:38-72`
- **Signature:** `List<EmployeeSalaryResponse> getEmployees()`
- **Owner:** `EmployeeReportServiceImpl`
- **Calls:** `com.aura.vihanga.reportservice.config.DepartmentConfigUrl#getDepartmentUrl()`

```java
public List<EmployeeSalaryResponse> getEmployees() {
        log.info("Report Service");
        List<Employee> employeesList = employeeReportRepository.findAll();

//        List<String> employeeDepartmentId = employees.stream().map(employee -> employee.getDepartment()).toList();

        DepartmentResponse[] departmentResponses = builder.build().get()
                .uri(departmentConfigUrl.getDepartmentUrl(), 10000)
                .retrieve()
                .bodyToMono(DepartmentResponse[].class)
                .block();
        List<DepartmentResponse> departmentResponseList = Arrays.asList(departmentResponses);

        List<EmployeeSalaryResponse> employeeSalaryResponseList = new ArrayList<>();

        for (Employee employee : employeesList) {
            for (DepartmentResponse department : departmentResponseList) {
                if (employee.getDepartment().equals(department.getDepartmentId())) {
                    EmployeeSalaryResponse employeeSalaryResponse = EmployeeSalaryResponse.builder()
                            .employeeId(employee.getEmployeeId())
                            .name(employee.getName())
                            .departmentName(department.getDepartmentName())
                            .salary(department.getSalary())
                            .build();

                    log.info("employee Salary {}",employeeSalaryResponse);

                    employeeSalaryResponseList.add(employeeSalaryResponse);
                }
            }
        }

        return employeeSalaryResponseList;

    }
```

### `Type` — EmployeeSchedulerRepository

- **id:** `com.aura.vihanga.shedulerservice.repository.EmployeeSchedulerRepository`
- **status:** NEW
- **selected because:** extends framework type(s): MongoRepository
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice.repository`
- **Kind:** `interface`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/repository/EmployeeSchedulerRepository.java:6`
- **Extends / implements:** `MongoRepository`
- **Depended on by:** 1 type(s)

### `Type` — ShedulerServiceApplication

- **id:** `com.aura.vihanga.shedulerservice.ShedulerServiceApplication`
- **status:** NEW
- **selected because:** @SpringBootApplication stereotype
- **Module:** `sheduler-service`
- **Package:** `com.aura.vihanga.shedulerservice`
- **Kind:** `class`
- **Location:** `sheduler-service/src/main/java/com/aura/vihanga/shedulerservice/ShedulerServiceApplication.java:7`
- **Annotations:** `@SpringBootApplication`, `@EnableScheduling`
- **Methods:** `void main(String[] args)`

## Cross-cutting notes

Some facts belong to no single node — a shared datastore, a service-to-service dependency that
carries no Java call edge, a deployment ordering constraint. Record those in the `crossCutting`
array, scoped to the modules and types they concern.
