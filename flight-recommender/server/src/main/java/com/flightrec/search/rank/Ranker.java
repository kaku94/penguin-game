package com.flightrec.search.rank;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.flightrec.config.AppProperties;
import com.flightrec.search.model.FlightOffer;
import com.flightrec.search.model.SearchResponse.Recommendation;

/**
 * PRD §6 추천 로직. LLM이 아닌 코드로 계산해 같은 입력이면 같은 순위가 나온다.
 * 점수 = 가격 가중치 × 가격점수 + 시간 가중치 × 시간효율점수 − 새벽 비행 감점
 */
@Component
public class Ranker {

    /** 시각 정보가 없어 체류시간을 모를 때의 시간효율점수 */
    static final double UNKNOWN_TIME_SCORE = 0.3;
    static final double RED_EYE_PENALTY = 0.1;

    private final AppProperties.Search config;

    public Ranker(AppProperties props) {
        this.config = props.search();
    }

    public List<Recommendation> rank(List<CityOffer> offers, int nights, int passengers, int maxBudgetKrw) {
        List<Candidate> candidates = dedupe(offers.stream()
                .map(Candidate::from)
                .filter(c -> c != null && (maxBudgetKrw <= 0 || c.price <= maxBudgetKrw))
                .toList());
        if (candidates.isEmpty()) {
            return List.of();
        }

        int minPrice = candidates.stream().mapToInt(c -> c.price).min().orElseThrow();
        double tripWindowHours = (nights + 1) * 24.0;
        double maxStayRatio = candidates.stream()
                .filter(c -> c.stayHours != null)
                .mapToDouble(c -> c.stayHours / tripWindowHours)
                .max().orElse(1.0);

        List<Scored> scored = new ArrayList<>();
        for (Candidate c : candidates) {
            double priceScore = (double) minPrice / c.price;
            double timeScore = c.stayHours == null ? UNKNOWN_TIME_SCORE
                    : (c.stayHours / tripWindowHours) / maxStayRatio;
            double penalty = (isRedEye(c.outboundDepart) ? RED_EYE_PENALTY : 0)
                    + (isRedEye(c.inboundArrive) ? RED_EYE_PENALTY : 0);
            double score = config.priceWeight() * priceScore + config.timeWeight() * timeScore - penalty;
            scored.add(new Scored(c, score, reason(c, minPrice)));
        }
        scored.sort(Comparator.comparingDouble(Scored::score).reversed());

        List<Recommendation> result = new ArrayList<>();
        for (Scored s : scored.subList(0, Math.min(config.maxResults(), scored.size()))) {
            Candidate c = s.candidate;
            FlightOffer o = c.offer;
            result.add(new Recommendation(result.size() + 1, c.city, o.originAirport(), o.destinationAirport(),
                    c.depart.toString(), c.ret.toString(), o.airline(), o.outbound(), o.inbound(), c.price,
                    o.priceBasis(), o.baggageIncluded(), c.stayHours, Math.round(s.score * 1000) / 1000.0, s.reason,
                    o.sourceUrls(), BookingLinks.of(o.originAirport(), o.destinationAirport(), c.depart, c.ret, passengers)));
        }
        return result;
    }

    /** 같은 도시·날짜 조합은 가장 싼 것 하나만 (결과 다양성) */
    private static List<Candidate> dedupe(List<Candidate> candidates) {
        Map<String, Candidate> best = new LinkedHashMap<>();
        for (Candidate c : candidates) {
            best.merge(c.city + "|" + c.depart + "|" + c.ret, c, (a, b) -> a.price <= b.price ? a : b);
        }
        return List.copyOf(best.values());
    }

    private static boolean isRedEye(LocalTime time) {
        return time != null && time.getHour() >= 1 && time.getHour() < 5;
    }

    private static String reason(Candidate c, int minPrice) {
        List<String> parts = new ArrayList<>();
        if (c.price == minPrice) {
            parts.add("후보 중 최저가");
        } else {
            parts.add("최저가보다 %d%% 비쌈".formatted(Math.round((c.price - minPrice) * 100.0 / minPrice)));
        }
        if (c.stayHours != null) {
            parts.add("현지 체류 약 %d시간".formatted(Math.round(c.stayHours)));
        }
        boolean earlyArrival = c.outboundArrive != null && c.outboundArrive.isBefore(LocalTime.of(11, 0));
        boolean lateReturn = c.inboundDepart != null && !c.inboundDepart.isBefore(LocalTime.of(18, 0));
        if (earlyArrival && lateReturn) {
            parts.add("오전 도착·저녁 귀국이라 일정이 꽉 참");
        } else if (earlyArrival) {
            parts.add("오전 도착");
        } else if (lateReturn) {
            parts.add("저녁 귀국");
        }
        if (isRedEye(c.outboundDepart) || isRedEye(c.inboundArrive)) {
            parts.add("새벽 비행 포함");
        }
        if ("date_range_estimate".equals(c.offer.priceBasis())) {
            parts.add("※ 날짜별 가격이 아닌 기간 추정가");
        }
        return String.join(", ", parts);
    }

    public record CityOffer(String city, FlightOffer offer) {
    }

    private record Scored(Candidate candidate, double score, String reason) {
    }

    private record Candidate(String city, FlightOffer offer, int price, LocalDate depart, LocalDate ret,
                             LocalTime outboundDepart, LocalTime outboundArrive,
                             LocalTime inboundDepart, LocalTime inboundArrive, Double stayHours) {

        /** 직항·가격·출처·날짜가 없는 결과는 버린다 (PRD §10: 출처 없는 가격 제외). */
        static Candidate from(CityOffer co) {
            FlightOffer o = co.offer();
            if (!o.nonstop() || o.priceKrw() == null || o.priceKrw() <= 0
                    || o.sourceUrls() == null || o.sourceUrls().isEmpty()
                    || o.originAirport() == null || o.destinationAirport() == null) {
                return null;
            }
            LocalDate depart = parseDate(o.departDate());
            LocalDate ret = parseDate(o.returnDate());
            if (depart == null || ret == null || ret.isBefore(depart)) {
                return null;
            }
            LocalTime outDep = o.outbound() == null ? null : parseTime(o.outbound().depart());
            LocalTime outArr = o.outbound() == null ? null : parseTime(o.outbound().arrive());
            LocalTime inDep = o.inbound() == null ? null : parseTime(o.inbound().depart());
            LocalTime inArr = o.inbound() == null ? null : parseTime(o.inbound().arrive());
            // 도착 시각과 귀국편 출발 시각은 둘 다 현지 시각이라 시차 보정 없이 뺄 수 있다
            Double stay = outArr == null || inDep == null ? null
                    : Duration.between(LocalDateTime.of(depart, outArr), LocalDateTime.of(ret, inDep)).toMinutes() / 60.0;
            if (stay != null && stay <= 0) {
                stay = null;
            }
            return new Candidate(co.city(), o, o.priceKrw(), depart, ret, outDep, outArr, inDep, inArr, stay);
        }

        private static LocalDate parseDate(String value) {
            try {
                return value == null ? null : LocalDate.parse(value);
            } catch (DateTimeParseException e) {
                return null;
            }
        }

        private static LocalTime parseTime(String value) {
            try {
                return value == null ? null : LocalTime.parse(value);
            } catch (DateTimeParseException e) {
                return null;
            }
        }
    }
}
