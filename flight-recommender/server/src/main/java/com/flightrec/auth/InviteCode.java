package com.flightrec.auth;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class InviteCode {

    @Id
    private String code;
    private String name;
    private int dailyLimit;
    private boolean active;
    private Instant createdAt;

    protected InviteCode() {
    }

    public InviteCode(String code, String name, int dailyLimit) {
        this.code = code;
        this.name = name;
        this.dailyLimit = dailyLimit;
        this.active = true;
        this.createdAt = Instant.now();
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    public int getDailyLimit() {
        return dailyLimit;
    }

    public boolean isActive() {
        return active;
    }
}
