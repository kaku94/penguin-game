package com.flightrec.profile;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;

/** 초대코드 하나에 프로필 하나. */
@Entity
public class UserProfile {

    public static final List<String> DEFAULT_HOME_AIRPORTS = List.of("ICN", "GMP");

    @Id
    private String inviteCode;
    /** 콤마로 구분한 IATA 코드, 예: "ICN,GMP" */
    private String homeAirports;
    @Enumerated(EnumType.STRING)
    private CarrierPreference carrierPreference;
    private Instant updatedAt;

    protected UserProfile() {
    }

    public static UserProfile defaults(String inviteCode) {
        UserProfile p = new UserProfile();
        p.inviteCode = inviteCode;
        p.update(DEFAULT_HOME_AIRPORTS, CarrierPreference.ANY);
        return p;
    }

    public void update(List<String> airports, CarrierPreference preference) {
        this.homeAirports = String.join(",", airports.stream().map(a -> a.trim().toUpperCase()).toList());
        this.carrierPreference = preference;
        this.updatedAt = Instant.now();
    }

    public List<String> getHomeAirports() {
        return Arrays.stream(homeAirports.split(",")).filter(s -> !s.isBlank()).toList();
    }

    public CarrierPreference getCarrierPreference() {
        return carrierPreference;
    }
}
