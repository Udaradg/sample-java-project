package com.virtusa.vihanga.departmentservice.service;

import com.virtusa.vihanga.departmentservice.dto.DepartmentResponse;
import com.virtusa.vihanga.departmentservice.model.Department;

import java.util.List;

public interface DepartmentService {
    DepartmentResponse getDepartment(String departmentId);
    DepartmentResponse createDepartment(Department department);
    List<DepartmentResponse> getAllDepartments(double minSalary);
}
