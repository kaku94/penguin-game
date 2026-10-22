package com.flightrec.search.flight;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class SearchCacheEntry {

    @Id
    private String cacheKey;
    @Column(columnDefinition = "TEXT")
    private String offersJson;
    private Instant createdAt;

    protected SearchCacheEntry() {
    }

    public SearchCacheEntry(String cacheKey, String offersJson) {
        this.cacheKey = cacheKey;
        this.offersJson = offersJson;
        this.createdAt = Instant.now();
    }

    public String getOffersJson() {
        return offersJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
