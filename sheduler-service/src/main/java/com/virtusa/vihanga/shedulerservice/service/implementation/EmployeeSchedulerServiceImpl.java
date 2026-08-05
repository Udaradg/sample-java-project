package com.virtusa.vihanga.shedulerservice.service.implementation;

import com.virtusa.vihanga.shedulerservice.entity.Employee;
import com.virtusa.vihanga.shedulerservice.repository.EmployeeSchedulerRepository;
import com.virtusa.vihanga.shedulerservice.service.EmployeeSchedulerService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class EmployeeSchedulerServiceImpl implements EmployeeSchedulerService {
    @Autowired
    private EmployeeSchedulerRepository employeeSchedulerRepository;

    @Override
    public List<Employee> getAllEmployees() {
        return employeeSchedulerRepository.findAll();
    }
}
