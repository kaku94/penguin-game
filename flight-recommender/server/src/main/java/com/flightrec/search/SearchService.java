package com.flightrec.search;

import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.flightrec.auth.InviteCode;
import com.flightrec.common.ApiException;
import com.flightrec.config.AppProperties;
import com.flightrec.profile.ProfileService;
import com.flightrec.profile.UserProfile;
import com.flightrec.search.destination.DestinationResolver;
import com.flightrec.search.flight.CachedFlightSearch;
import com.flightrec.search.flight.FlightSearchClient;
import com.flightrec.search.model.DatePair;
import com.flightrec.search.model.SearchResponse;
import com.flightrec.search.model.SearchResponse.Destination;
import com.flightrec.search.model.SearchResponse.ParsedSummary;
import com.flightrec.search.model.SearchResponse.Recommendation;
import com.flightrec.search.model.TripQuery;
import com.flightrec.search.model.Usage;
import com.flightrec.search.rank.Ranker;
import com.flightrec.search.usage.SearchLog;
import com.flightrec.search.usage.SearchLogRepository;
import com.flightrec.search.usage.UsageGuard;

/** 질문 해석 → 후보 도시·날짜 → 도시별 병렬 웹 검색 → 랭킹 (PRD §7). */
@Service
public class SearchService {

    private static final Logger log = LoggerFactory.getLogger(SearchService.class);

    private final QueryParser parser;
    private final DestinationResolver destinations;
    private final CachedFlightSearch flightSearch;
    private final Ranker ranker;
    private final ProfileService profiles;
    private final UsageGuard usageGuard;
    private final SearchLogRepository searchLogs;
    private final AppProperties props;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public SearchService(QueryParser parser, DestinationResolver destinations, CachedFlightSearch flightSearch,
                         Ranker ranker, ProfileService profiles, UsageGuard usageGuard,
                         SearchLogRepository searchLogs, AppProperties props) {
        this.parser = parser;
        this.destinations = destinations;
        this.flightSearch = flightSearch;
        this.ranker = ranker;
        this.profiles = profiles;
        this.usageGuard = usageGuard;
        this.searchLogs = searchLogs;
        this.props = props;
    }

    public SearchResponse search(String question, InviteCode invite, SearchListener listener) {
        usageGuard.check(invite);
        // 진행 중인 검색도 일일 한도에 잡히도록 먼저 기록한다
        SearchLog searchLog = searchLogs.save(new SearchLog(invite.getCode(), question));
        long start = System.nanoTime();
        Usage usage = Usage.ZERO;
        try {
            Outcome outcome = run(question, invite, listener, start);
            usage = outcome.usage;
            SearchResponse response = outcome.toResponse(question, elapsedMs(start), props.anthropic());
            searchLog.finish(response.stats().latencyMs(), usage.inputTokens(), usage.outputTokens(),
                    usage.webSearches(), response.stats().estimatedCostUsd(), response.recommendations().size(), null);
            return response;
        } catch (RuntimeException e) {
            searchLog.finish(elapsedMs(start), usage.inputTokens(), usage.outputTokens(), usage.webSearches(),
                    props.anthropic().costUsd(usage.inputTokens(), usage.outputTokens(), usage.webSearches()), 0,
                    e.getClass().getSimpleName() + ": " + e.getMessage());
            throw e;
        } finally {
            searchLogs.save(searchLog);
        }
    }

    private Outcome run(String question, InviteCode invite, SearchListener listener, long start) {
        AppProperties.Search config = props.search();
        LocalDate today = LocalDate.now(UsageGuard.ZONE);
        UserProfile profile = profiles.get(invite.getCode());

        listener.progress("질문을 해석하는 중...");
        QueryParser.Parsed parsed = parser.parse(question, today);
        TripQuery query = parsed.query();
        Usage usage = parsed.usage();

        List<Destination> cities = destinations.resolve(query, config.maxCities());
        if (cities.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "목적지를 정하지 못했습니다. 나라나 도시를 넣어 다시 질문해주세요.");
        }
        List<DatePair> datePairs;
        try {
            datePairs = DateCombinations.generate(query, today, config.maxDatePairs());
        } catch (RuntimeException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "여행 날짜를 이해하지 못했습니다. 기간을 넣어 다시 질문해주세요.");
        }
        if (datePairs.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "조건에 맞는 날짜 조합이 없습니다. 기간이나 요일 조건을 넓혀주세요.");
        }

        int passengers = Math.max(1, query.passengers());
        List<String> origins = profile.getHomeAirports();
        ParsedSummary summary = new ParsedSummary(query.purpose(), origins, cities, query.dateFrom(), query.dateTo(),
                query.nights(), query.weekdaysOnly(), passengers,
                datePairs.stream().map(DatePair::toString).toList(), query.assumptions());
        listener.parsed(summary);

        int searchesPerCity = Math.max(1, config.maxWebSearches() / cities.size());
        List<CompletableFuture<CityResult>> futures = new ArrayList<>();
        for (Destination city : cities) {
            listener.progress(city.city() + " 검색 중...");
            futures.add(CompletableFuture.supplyAsync(() -> {
                FlightSearchClient.Result result = flightSearch.search(origins, city, datePairs,
                        profile.getCarrierPreference(), searchesPerCity);
                listener.progress("%s 검색 완료 (후보 %d개)".formatted(city.city(), result.offers().size()));
                return new CityResult(city, result);
            }, executor));
        }

        boolean partial = waitUntilDeadline(futures, config.timeout().minus(Duration.ofNanos(System.nanoTime() - start)));
        List<Ranker.CityOffer> offers = new ArrayList<>();
        List<String> notices = new ArrayList<>();
        notices.add("가격은 웹 검색으로 찾은 1인 왕복 추정가(세금 포함, 위탁수하물 미포함)입니다. 예약 링크에서 꼭 확인하세요.");
        for (CompletableFuture<CityResult> future : futures) {
            if (!future.isDone()) {
                future.cancel(true);
                continue;
            }
            try {
                CityResult cityResult = future.get();
                usage = usage.plus(cityResult.result.usage());
                cityResult.result.offers().forEach(o -> offers.add(new Ranker.CityOffer(cityResult.city.city(), o)));
            } catch (ExecutionException e) {
                log.warn("도시 검색 실패", e.getCause());
                notices.add("일부 도시 검색에 실패했습니다: " + e.getCause().getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        if (partial) {
            notices.add("시간 제한으로 일부 도시 결과가 빠졌습니다.");
        }

        listener.progress("후보를 비교하는 중...");
        List<Recommendation> recommendations = ranker.rank(offers, Math.max(0, query.nights()), passengers,
                query.maxBudgetKrw());
        if (recommendations.isEmpty()) {
            notices.add("출처가 확인된 직항 가격을 찾지 못했습니다. 날짜나 도시를 바꿔 다시 시도해보세요.");
        }
        return new Outcome(summary, recommendations, partial, notices, usage);
    }

    /** @return 제한 시간 안에 끝나지 않은 검색이 있으면 true */
    private static boolean waitUntilDeadline(List<CompletableFuture<CityResult>> futures, Duration remaining) {
        try {
            CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new))
                    .get(Math.max(0, remaining.toMillis()), TimeUnit.MILLISECONDS);
            return false;
        } catch (TimeoutException e) {
            return true;
        } catch (ExecutionException e) {
            // 개별 실패는 결과 수집 단계에서 처리한다
            return futures.stream().anyMatch(f -> !f.isDone());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return true;
        }
    }

    private static long elapsedMs(long start) {
        return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start);
    }

    private record CityResult(Destination city, FlightSearchClient.Result result) {
    }

    private record Outcome(ParsedSummary summary, List<Recommendation> recommendations, boolean partial,
                           List<String> notices, Usage usage) {

        SearchResponse toResponse(String question, long latencyMs, AppProperties.Anthropic pricing) {
            double cost = pricing.costUsd(usage.inputTokens(), usage.outputTokens(), usage.webSearches());
            return new SearchResponse(question, summary, recommendations, partial, notices,
                    new SearchResponse.Stats(latencyMs, usage.webSearches(), usage.inputTokens(), usage.outputTokens(),
                            Math.round(cost * 10000) / 10000.0));
        }
    }
}
