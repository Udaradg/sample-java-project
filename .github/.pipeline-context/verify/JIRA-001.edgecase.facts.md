# Edge-case Review Facts — JIRA-001

_Collected 2026-09-22T04:13:00.668Z. Materials only — the adversarial reasoning is yours._

**Story:** Add pagination, sorting and filtering to the employee listing endpoint

## 1. The plan's own claim

_Plan approach not available._

## 2. Story's out-of-scope list (a gap here is expected, not a finding)

- Paginating `/search` or `/high-earners` (candidates for a follow-up story).
- Cursor-based (as opposed to offset-based) pagination.
- Changing the default page size based on caller identity or role.

## 3. The diff

```diff
diff --git a/src/main/java/com/example/migrationdemo/controller/EmployeeController.java b/src/main/java/com/example/migrationdemo/controller/EmployeeController.java
index 5431e8a..1740952 100644
--- a/src/main/java/com/example/migrationdemo/controller/EmployeeController.java
+++ b/src/main/java/com/example/migrationdemo/controller/EmployeeController.java
@@ -3,19 +3,28 @@ package com.example.migrationdemo.controller;
 import com.example.migrationdemo.dto.EmployeeCreateRequest;
 import com.example.migrationdemo.dto.EmployeeResponse;
 import com.example.migrationdemo.dto.EmployeeUpdateRequest;
+import com.example.migrationdemo.dto.PageResponse;
 import com.example.migrationdemo.service.EmployeeService;
 import jakarta.validation.Valid;
+import org.springframework.data.domain.PageRequest;
+import org.springframework.data.domain.Pageable;
+import org.springframework.data.domain.Sort;
 import org.springframework.http.HttpStatus;
 import org.springframework.http.ResponseEntity;
 import org.springframework.web.bind.annotation.*;
 
 import java.math.BigDecimal;
 import java.util.List;
+import java.util.Set;
 
 @RestController
 @RequestMapping("/api/v1/employees")
 public class EmployeeController {
 
+    private static final int MAX_PAGE_SIZE = 100;
+    private static final Set<String> SORTABLE_FIELDS = Set.of(
+            "firstName", "lastName", "email", "department", "salary", "createdAt");
+
     private final EmployeeService employeeService;
 
     public EmployeeController(EmployeeService employeeService) {
@@ -29,11 +38,43 @@ public class EmployeeController {
     }
 
     @GetMapping
-    public ResponseEntity<List<EmployeeResponse>> getAllEmployees() {
-        List<EmployeeResponse> employees = employeeService.getAllEmployees();
+    public ResponseEntity<PageResponse<EmployeeResponse>> getAllEmployees(
+            @RequestParam(defaultValue = "0") int page,
+            @RequestParam(defaultValue = "20") int size,
+            @RequestParam(required = false) String sort,
+            @RequestParam(required = false) String department,
+            @RequestParam(required = false) Boolean active) {
+        Pageable pageable = buildPageable(page, size, sort);
+        PageResponse<EmployeeResponse> employees = employeeService.getAllEmployees(pageable, department, active);
         return ResponseEntity.ok(employees);
     }
 
+    private Pageable buildPageable(int page, int size, String sort) {
+        int clampedSize = Math.min(size, MAX_PAGE_SIZE);
+        if (sort == null || sort.isBlank()) {
+            return PageRequest.of(page, clampedSize);
+        }
+
+        String[] parts = sort.split(",");
+        if (parts.length != 2) {
+            throw new IllegalArgumentException("Invalid sort parameter: " + sort);
+        }
+        String field = parts[0].trim();
+        String direction = parts[1].trim();
+        if (!SORTABLE_FIELDS.contains(field)) {
+            throw new IllegalArgumentException("Invalid sort field: " + field);
+        }
+
+        Sort.Direction sortDirection;
+        try {
+            sortDirection = Sort.Direction.fromString(direction);
+        } catch (IllegalArgumentException ex) {
+            throw new IllegalArgumentException("Invalid sort direction: " + direction);
+        }
+
+        return PageRequest.of(page, clampedSize, Sort.by(sortDirection, field));
+    }
+
     @GetMapping("/{id}")
     public ResponseEntity<EmployeeResponse> getEmployeeById(@PathVariable Long id) {
         EmployeeResponse employee = employeeService.getEmployeeById(id);
diff --git a/src/main/java/com/example/migrationdemo/dto/PageResponse.java b/src/main/java/com/example/migrationdemo/dto/PageResponse.java
new file mode 100644
index 0000000..d3f05ed
--- /dev/null
+++ b/src/main/java/com/example/migrationdemo/dto/PageResponse.java
@@ -0,0 +1,64 @@
+package com.example.migrationdemo.dto;
+
+import java.util.List;
+
+public class PageResponse<T> {
+
+    private List<T> content;
+    private int page;
+    private int size;
+    private long totalElements;
+    private int totalPages;
+
+    public PageResponse() {
+    }
+
+    public PageResponse(List<T> content, int page, int size, long totalElements, int totalPages) {
+        this.content = content;
+        this.page = page;
+        this.size = size;
+        this.totalElements = totalElements;
+        this.totalPages = totalPages;
+    }
+
+    public List<T> getContent() {
+        return content;
+    }
+
+    public void setContent(List<T> content) {
+        this.content = content;
+    }
+
+    public int getPage() {
+        return page;
+    }
+
+    public void setPage(int page) {
+        this.page = page;
+    }
+
+    public int getSize() {
+        return size;
+    }
+
+    public void setSize(int size) {
+        this.size = size;
+    }
+
+    public long getTotalElements() {
+        return totalElements;
+    }
+
+    public void setTotalElements(long totalElements) {
+        this.totalElements = totalElements;
+    }
+
+    public int getTotalPages() {
+        return totalPages;
+    }
+
+    public void setTotalPages(int totalPages) {
+        this.totalPages = totalPages;
+    }
+
+}
diff --git a/src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java b/src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java
index 1590ff0..ab0aa44 100644
--- a/src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java
+++ b/src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java
@@ -65,6 +65,18 @@ public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
         return handleExceptionInternal(ex, errorResponse, headers, status, request);
     }
 
+    @ExceptionHandler(IllegalArgumentException.class)
+    public ResponseEntity<ErrorResponse> handleIllegalArgument(
+            IllegalArgumentException ex, HttpServletRequest request) {
+        ErrorResponse errorResponse = new ErrorResponse(
+                LocalDateTime.now(),
+                HttpStatus.BAD_REQUEST.value(),
+                "Bad Request",
+                ex.getMessage(),
+                request.getRequestURI());
+        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
+    }
+
     @ExceptionHandler(Exception.class)
     public ResponseEntity<ErrorResponse> handleGenericException(
             Exception ex, HttpServletRequest request) {
diff --git a/src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java b/src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
index 6b222a7..344230d 100644
--- a/src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
+++ b/src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java
@@ -2,6 +2,7 @@ package com.example.migrationdemo.repository;
 
 import com.example.migrationdemo.entity.Employee;
 import org.springframework.data.jpa.repository.JpaRepository;
+import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
 import org.springframework.data.jpa.repository.Query;
 import org.springframework.data.repository.query.Param;
 import org.springframework.stereotype.Repository;
@@ -11,7 +12,7 @@ import java.util.List;
 import java.util.Optional;
 
 @Repository
-public interface EmployeeRepository extends JpaRepository<Employee, Long> {
+public interface EmployeeRepository extends JpaRepository<Employee, Long>, JpaSpecificationExecutor<Employee> {
 
     Optional<Employee> findByEmployeeNumber(String employeeNumber);
 
diff --git a/src/main/java/com/example/migrationdemo/service/EmployeeService.java b/src/main/java/com/example/migrationdemo/service/EmployeeService.java
index d2f7538..fc56750 100644
--- a/src/main/java/com/example/migrationdemo/service/EmployeeService.java
+++ b/src/main/java/com/example/migrationdemo/service/EmployeeService.java
@@ -3,15 +3,21 @@ package com.example.migrationdemo.service;
 import com.example.migrationdemo.dto.EmployeeCreateRequest;
 import com.example.migrationdemo.dto.EmployeeResponse;
 import com.example.migrationdemo.dto.EmployeeUpdateRequest;
+import com.example.migrationdemo.dto.PageResponse;
 import com.example.migrationdemo.entity.Employee;
 import com.example.migrationdemo.exception.DuplicateEmployeeException;
 import com.example.migrationdemo.exception.EmployeeNotFoundException;
 import com.example.migrationdemo.mapper.EmployeeMapper;
 import com.example.migrationdemo.repository.EmployeeRepository;
+import jakarta.persistence.criteria.Predicate;
+import org.springframework.data.domain.Page;
+import org.springframework.data.domain.Pageable;
+import org.springframework.data.jpa.domain.Specification;
 import org.springframework.stereotype.Service;
 import org.springframework.transaction.annotation.Transactional;
 
 import java.math.BigDecimal;
+import java.util.ArrayList;
 import java.util.List;
 import java.util.stream.Collectors;
 
@@ -51,6 +57,35 @@ public class EmployeeService {
                 .collect(Collectors.toList());
     }
 
+    @Transactional(readOnly = true)
+    public PageResponse<EmployeeResponse> getAllEmployees(Pageable pageable, String department, Boolean active) {
+        Specification<Employee> specification = buildFilterSpecification(department, active);
+        Page<Employee> employeePage = employeeRepository.findAll(specification, pageable);
+        List<EmployeeResponse> content = employeePage.getContent()
+                .stream()
+                .map(employeeMapper::toResponse)
+                .collect(Collectors.toList());
+        return new PageResponse<>(
+                content,
+                employeePage.getNumber(),
+                employeePage.getSize(),
+                employeePage.getTotalElements(),
+                employeePage.getTotalPages());
+    }
+
+    private Specification<Employee> buildFilterSpecification(String department, Boolean active) {
+        return (root, query, criteriaBuilder) -> {
+            List<Predicate> predicates = new ArrayList<>();
+            if (department != null) {
+                predicates.add(criteriaBuilder.equal(root.get("department"), department));
+            }
+            if (active != null) {
+                predicates.add(criteriaBuilder.equal(root.get("active"), active));
+            }
+            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
+        };
+    }
+
     @Transactional(readOnly = true)
     public EmployeeResponse getEmployeeById(Long id) {
         Employee employee = employeeRepository.findById(id)
```

## 4. Patched source (isolated worktree, never the real tree)

### `src/main/java/com/example/migrationdemo/controller/EmployeeController.java`

```java
package com.example.migrationdemo.controller;

import com.example.migrationdemo.dto.EmployeeCreateRequest;
import com.example.migrationdemo.dto.EmployeeResponse;
import com.example.migrationdemo.dto.EmployeeUpdateRequest;
import com.example.migrationdemo.dto.PageResponse;
import com.example.migrationdemo.service.EmployeeService;
import jakarta.validation.Valid;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/employees")
public class EmployeeController {

    private static final int MAX_PAGE_SIZE = 100;
    private static final Set<String> SORTABLE_FIELDS = Set.of(
            "firstName", "lastName", "email", "department", "salary", "createdAt");

    private final EmployeeService employeeService;

    public EmployeeController(EmployeeService employeeService) {
        this.employeeService = employeeService;
    }

    @PostMapping
    public ResponseEntity<EmployeeResponse> createEmployee(@Valid @RequestBody EmployeeCreateRequest request) {
        EmployeeResponse response = employeeService.createEmployee(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }

    @GetMapping
    public ResponseEntity<PageResponse<EmployeeResponse>> getAllEmployees(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) String department,
            @RequestParam(required = false) Boolean active) {
        Pageable pageable = buildPageable(page, size, sort);
        PageResponse<EmployeeResponse> employees = employeeService.getAllEmployees(pageable, department, active);
        return ResponseEntity.ok(employees);
    }

    private Pageable buildPageable(int page, int size, String sort) {
        int clampedSize = Math.min(size, MAX_PAGE_SIZE);
        if (sort == null || sort.isBlank()) {
            return PageRequest.of(page, clampedSize);
        }

        String[] parts = sort.split(",");
        if (parts.length != 2) {
            throw new IllegalArgumentException("Invalid sort parameter: " + sort);
        }
        String field = parts[0].trim();
        String direction = parts[1].trim();
        if (!SORTABLE_FIELDS.contains(field)) {
            throw new IllegalArgumentException("Invalid sort field: " + field);
        }

        Sort.Direction sortDirection;
        try {
            sortDirection = Sort.Direction.fromString(direction);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Invalid sort direction: " + direction);
        }

        return PageRequest.of(page, clampedSize, Sort.by(sortDirection, field));
    }

    @GetMapping("/{id}")
    public ResponseEntity<EmployeeResponse> getEmployeeById(@PathVariable Long id) {
        EmployeeResponse employee = employeeService.getEmployeeById(id);
        return ResponseEntity.ok(employee);
    }

    @PutMapping("/{id}")
    public ResponseEntity<EmployeeResponse> updateEmployee(
            @PathVariable Long id,
            @Valid @RequestBody EmployeeUpdateRequest request) {
        EmployeeResponse response = employeeService.updateEmployee(id, request);
        return ResponseEntity.ok(response);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable Long id) {
        employeeService.deleteEmployee(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/search")
    public ResponseEntity<List<EmployeeResponse>> searchByDepartment(
            @RequestParam String department) {
        List<EmployeeResponse> employees = employeeService.searchByDepartment(department);
        return ResponseEntity.ok(employees);
    }

    @GetMapping("/high-earners")
    public ResponseEntity<List<EmployeeResponse>> getHighEarners(
            @RequestParam BigDecimal salary) {
        List<EmployeeResponse> employees = employeeService.findHighEarners(salary);
        return ResponseEntity.ok(employees);
    }

}

```

### `src/main/java/com/example/migrationdemo/dto/PageResponse.java`

```java
package com.example.migrationdemo.dto;

import java.util.List;

public class PageResponse<T> {

    private List<T> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;

    public PageResponse() {
    }

    public PageResponse(List<T> content, int page, int size, long totalElements, int totalPages) {
        this.content = content;
        this.page = page;
        this.size = size;
        this.totalElements = totalElements;
        this.totalPages = totalPages;
    }

    public List<T> getContent() {
        return content;
    }

    public void setContent(List<T> content) {
        this.content = content;
    }

    public int getPage() {
        return page;
    }

    public void setPage(int page) {
        this.page = page;
    }

    public int getSize() {
        return size;
    }

    public void setSize(int size) {
        this.size = size;
    }

    public long getTotalElements() {
        return totalElements;
    }

    public void setTotalElements(long totalElements) {
        this.totalElements = totalElements;
    }

    public int getTotalPages() {
        return totalPages;
    }

    public void setTotalPages(int totalPages) {
        this.totalPages = totalPages;
    }

}

```

### `src/main/java/com/example/migrationdemo/exception/GlobalExceptionHandler.java`

```java
package com.example.migrationdemo.exception;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.time.LocalDateTime;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(EmployeeNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleEmployeeNotFound(
            EmployeeNotFoundException ex, HttpServletRequest request) {
        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.NOT_FOUND.value(),
                "Not Found",
                ex.getMessage(),
                request.getRequestURI());
        return new ResponseEntity<>(errorResponse, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(DuplicateEmployeeException.class)
    public ResponseEntity<ErrorResponse> handleDuplicateEmployee(
            DuplicateEmployeeException ex, HttpServletRequest request) {
        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                "Conflict",
                ex.getMessage(),
                request.getRequestURI());
        return new ResponseEntity<>(errorResponse, HttpStatus.CONFLICT);
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        String message = ex.getBindingResult().getFieldErrors()
                .stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .collect(Collectors.joining(", "));
        String path = request instanceof ServletWebRequest servletWebRequest
                ? servletWebRequest.getRequest().getRequestURI()
                : "";

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                "Validation failed: " + message,
                path);
        return handleExceptionInternal(ex, errorResponse, headers, status, request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleIllegalArgument(
            IllegalArgumentException ex, HttpServletRequest request) {
        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                "Bad Request",
                ex.getMessage(),
                request.getRequestURI());
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(
            Exception ex, HttpServletRequest request) {
        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Internal Server Error",
                "An unexpected error occurred",
                request.getRequestURI());
        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }

}

```

### `src/main/java/com/example/migrationdemo/repository/EmployeeRepository.java`

```java
package com.example.migrationdemo.repository;

import com.example.migrationdemo.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, Long>, JpaSpecificationExecutor<Employee> {

    Optional<Employee> findByEmployeeNumber(String employeeNumber);

    List<Employee> findByDepartmentIgnoreCase(String department);

    /**
     * MIGRATION-DEMO: JPQL query that will be validated for Hibernate compatibility
     * during Spring Boot 4 migration.
     */
    @Query("""
            select e
            from Employee e
            where lower(e.department) = lower(:department)
            and e.active = true
            """)
    List<Employee> findActiveEmployeesByDepartment(
            @Param("department") String department);

    /**
     * MIGRATION-DEMO: Native PostgreSQL query that will be validated for
     * database compatibility during Spring Boot 4 migration.
     */
    @Query(value = """
            select *
            from employees
            where salary > :salary
            and active = true
            order by salary desc
            """, nativeQuery = true)
    List<Employee> findHighEarners(
            @Param("salary") BigDecimal salary);

}

```

### `src/main/java/com/example/migrationdemo/service/EmployeeService.java`

```java
package com.example.migrationdemo.service;

import com.example.migrationdemo.dto.EmployeeCreateRequest;
import com.example.migrationdemo.dto.EmployeeResponse;
import com.example.migrationdemo.dto.EmployeeUpdateRequest;
import com.example.migrationdemo.dto.PageResponse;
import com.example.migrationdemo.entity.Employee;
import com.example.migrationdemo.exception.DuplicateEmployeeException;
import com.example.migrationdemo.exception.EmployeeNotFoundException;
import com.example.migrationdemo.mapper.EmployeeMapper;
import com.example.migrationdemo.repository.EmployeeRepository;
import jakarta.persistence.criteria.Predicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final EmployeeMapper employeeMapper;

    public EmployeeService(EmployeeRepository employeeRepository, EmployeeMapper employeeMapper) {
        this.employeeRepository = employeeRepository;
        this.employeeMapper = employeeMapper;
    }

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

    @Transactional(readOnly = true)
    public List<EmployeeResponse> getAllEmployees() {
        return employeeRepository.findAll()
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public PageResponse<EmployeeResponse> getAllEmployees(Pageable pageable, String department, Boolean active) {
        Specification<Employee> specification = buildFilterSpecification(department, active);
        Page<Employee> employeePage = employeeRepository.findAll(specification, pageable);
        List<EmployeeResponse> content = employeePage.getContent()
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
        return new PageResponse<>(
                content,
                employeePage.getNumber(),
                employeePage.getSize(),
                employeePage.getTotalElements(),
                employeePage.getTotalPages());
    }

    private Specification<Employee> buildFilterSpecification(String department, Boolean active) {
        return (root, query, criteriaBuilder) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (department != null) {
                predicates.add(criteriaBuilder.equal(root.get("department"), department));
            }
            if (active != null) {
                predicates.add(criteriaBuilder.equal(root.get("active"), active));
            }
            return criteriaBuilder.and(predicates.toArray(new Predicate[0]));
        };
    }

    @Transactional(readOnly = true)
    public EmployeeResponse getEmployeeById(Long id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));
        return employeeMapper.toResponse(employee);
    }

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

    @Transactional
    public void deleteEmployee(Long id) {
        Employee employee = employeeRepository.findById(id)
                .orElseThrow(() -> new EmployeeNotFoundException(id));
        employeeRepository.delete(employee);
    }

    @Transactional(readOnly = true)
    public List<EmployeeResponse> searchByDepartment(String department) {
        return employeeRepository.findByDepartmentIgnoreCase(department)
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<EmployeeResponse> findActiveEmployeesByDepartment(String department) {
        return employeeRepository.findActiveEmployeesByDepartment(department)
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<EmployeeResponse> findHighEarners(BigDecimal salary) {
        return employeeRepository.findHighEarners(salary)
                .stream()
                .map(employeeMapper::toResponse)
                .collect(Collectors.toList());
    }

}

```

## 5. What to write next

Read this briefing, then write `.github/.pipeline-context/verify/JIRA-001.edgecase.verdict.json` following `templates/edgecase.schema.json`. Enumerate concrete edge cases against the *new* code — a boundary value, a null/empty input, an unexpected combination of parameters — that the plan didn't explicitly account for. A gap the story explicitly put out of scope is not a finding.
