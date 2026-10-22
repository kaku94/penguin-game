package com.flightrec.search.destination;

import java.util.Arrays;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.flightrec.search.model.SearchResponse.Destination;
import com.flightrec.search.model.TripQuery;

/** PRD F2: 사용자가 지정한 도시 → 관리 테이블 → LLM 제안 순으로 후보 도시를 정한다. */
@Component
public class DestinationResolver {

    private static final Logger log = LoggerFactory.getLogger(DestinationResolver.class);

    private final CityMappingRepository repository;

    public DestinationResolver(CityMappingRepository repository) {
        this.repository = repository;
    }

    public List<Destination> resolve(TripQuery query, int maxCities) {
        if (query.citiesExplicit()) {
            return fromSuggestions(query, "USER", maxCities);
        }
        List<CityMapping> mapped = repository.findByRegionAndPurposeOrderById(query.region(), query.purpose());
        if (!mapped.isEmpty()) {
            return mapped.stream()
                    .limit(maxCities)
                    .map(m -> new Destination(m.getCity(), m.getAirports(), m.getReason(), "TABLE"))
                    .toList();
        }
        List<Destination> suggested = fromSuggestions(query, "LLM", maxCities);
        // 테이블에 추가할 후보로 검토하려고 남긴다 (PRD F2)
        log.info("도시 매핑 LLM 폴백: region={}, purpose={}, cities={}", query.region(), query.purpose(),
                suggested.stream().map(Destination::city).toList());
        return suggested;
    }

    private static List<Destination> fromSuggestions(TripQuery query, String source, int maxCities) {
        return query.suggestedCities().stream()
                .filter(c -> c.airportCodes() != null && !c.airportCodes().isBlank())
                .limit(maxCities)
                .map(c -> new Destination(c.city(),
                        Arrays.stream(c.airportCodes().split(",")).map(s -> s.trim().toUpperCase()).toList(),
                        c.reason(), source))
                .toList();
    }
}
