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
