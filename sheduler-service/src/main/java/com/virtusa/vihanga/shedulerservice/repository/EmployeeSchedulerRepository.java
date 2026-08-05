package com.virtusa.vihanga.shedulerservice.repository;

import com.virtusa.vihanga.shedulerservice.entity.Employee;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface EmployeeSchedulerRepository extends MongoRepository<Employee, String> {
}
