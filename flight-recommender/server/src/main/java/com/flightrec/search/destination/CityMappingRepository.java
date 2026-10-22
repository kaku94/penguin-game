package com.flightrec.search.destination;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CityMappingRepository extends JpaRepository<CityMapping, Long> {

    List<CityMapping> findByRegionAndPurposeOrderById(String region, String purpose);
}
