package com.virtusa.vihanga.shedulerservice.service.implementation;

import com.virtusa.vihanga.shedulerservice.entity.Employee;
import com.virtusa.vihanga.shedulerservice.service.EmployeeSchedulerService;
import com.virtusa.vihanga.shedulerservice.utill.GenderType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class WomenDaySchedulerImpl {

    @Autowired
    private EmployeeSchedulerService employeeSchedulerService;

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
}
