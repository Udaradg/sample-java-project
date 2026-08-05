package com.virtusa.vihanga.reportservice.repository;

import com.virtusa.vihanga.reportservice.entity.Employee;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EmployeeReportRepository extends MongoRepository<Employee, String> {
  List<Employee> findByDepartment(String department);
}
