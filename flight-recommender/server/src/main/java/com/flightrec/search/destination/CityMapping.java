package com.flightrec.search.destination;

import java.util.Arrays;
import java.util.List;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

/** (국가, 목적) → 후보 도시. PRD §12 결정: 테이블 우선, 없으면 LLM 폴백. */
@Entity
public class CityMapping {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String region;
    private String purpose;
    private String city;
    /** 콤마로 구분한 IATA 코드 */
    private String airportCodes;
    private String reason;

    protected CityMapping() {
    }

    public CityMapping(String region, String purpose, String city, String airportCodes, String reason) {
        this.region = region;
        this.purpose = purpose;
        this.city = city;
        this.airportCodes = airportCodes;
        this.reason = reason;
    }

    public String getCity() {
        return city;
    }

    public List<String> getAirports() {
        return Arrays.stream(airportCodes.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }

    public String getReason() {
        return reason;
    }
}
