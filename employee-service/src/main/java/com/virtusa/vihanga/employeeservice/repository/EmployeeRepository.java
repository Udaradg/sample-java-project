package com.virtusa.vihanga.employeeservice.repository;

import com.virtusa.vihanga.employeeservice.model.Employee;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface EmployeeRepository extends MongoRepository<Employee, String> {
}
