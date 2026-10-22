package com.flightrec.search.flight;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;

import org.springframework.stereotype.Component;

import com.flightrec.config.AppProperties;
import com.flightrec.profile.CarrierPreference;
import com.flightrec.search.model.DatePair;
import com.flightrec.search.model.FlightOffer;
import com.flightrec.search.model.SearchResponse.Destination;
import com.flightrec.search.model.Usage;

import tools.jackson.databind.json.JsonMapper;

/** 같은 출발지·도착지·날짜 조합은 cache-ttl 동안 웹 검색을 다시 하지 않는다 (PRD §7, §9). */
@Component
public class CachedFlightSearch {

    private final FlightSearchClient client;
    private final SearchCacheRepository repository;
    private final JsonMapper jsonMapper;
    private final AppProperties props;

    public CachedFlightSearch(FlightSearchClient client, SearchCacheRepository repository, JsonMapper jsonMapper,
                              AppProperties props) {
        this.client = client;
        this.repository = repository;
        this.jsonMapper = jsonMapper;
        this.props = props;
    }

    public FlightSearchClient.Result search(List<String> origins, Destination destination, List<DatePair> datePairs,
                                            CarrierPreference preference, int maxWebSearches) {
        String key = cacheKey(origins, destination, datePairs, preference);
        Instant freshAfter = Instant.now().minus(props.search().cacheTtl());
        var cached = repository.findById(key).filter(e -> e.getCreatedAt().isAfter(freshAfter));
        if (cached.isPresent()) {
            return new FlightSearchClient.Result(
                    List.of(jsonMapper.readValue(cached.get().getOffersJson(), FlightOffer[].class)), Usage.ZERO);
        }

        FlightSearchClient.Result result = client.search(origins, destination, datePairs, preference, maxWebSearches);
        // 못 찾은 결과까지 캐시하면 일시적 실패가 TTL 동안 굳으므로 찾은 경우만 저장
        if (!result.offers().isEmpty()) {
            repository.save(new SearchCacheEntry(key, jsonMapper.writeValueAsString(result.offers())));
        }
        return result;
    }

    private String cacheKey(List<String> origins, Destination destination, List<DatePair> datePairs,
                            CarrierPreference preference) {
        String raw = String.join("|", props.anthropic().searchModel(), String.join(",", origins),
                String.join(",", destination.airports()), datePairs.toString(), preference.name());
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
