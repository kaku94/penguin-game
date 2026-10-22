package com.flightrec.search.flight;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SearchCacheRepository extends JpaRepository<SearchCacheEntry, String> {
}
