package com.virtusa.vihanga.reportservice.service;


import com.virtusa.vihanga.reportservice.dto.EmployeeSalaryResponse;
import com.virtusa.vihanga.reportservice.entity.Employee;

import java.io.IOException;
import java.util.List;

public interface EmployeeReportService {
    List<EmployeeSalaryResponse> getEmployees();

    public byte[] generateExcelFile(List<EmployeeSalaryResponse> employees) throws IOException;
}
