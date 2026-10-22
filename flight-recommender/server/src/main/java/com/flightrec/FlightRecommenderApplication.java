package com.flightrec;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class FlightRecommenderApplication {

    public static void main(String[] args) {
        SpringApplication.run(FlightRecommenderApplication.class, args);
    }
}
