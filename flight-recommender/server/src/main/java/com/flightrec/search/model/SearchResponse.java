package com.flightrec.search.model;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

public record SearchResponse(
        String question,
        ParsedSummary parsed,
        List<Recommendation> recommendations,
        @Schema(description = "시간 제한에 걸려 일부 도시 검색 결과가 빠졌으면 true")
        boolean partial,
        List<String> notices,
        Stats stats) {

    public record ParsedSummary(
            String purpose,
            List<String> origins,
            List<Destination> destinations,
            String dateFrom,
            String dateTo,
            int nights,
            boolean weekdaysOnly,
            int passengers,
            List<String> datePairs,
            List<String> assumptions) {
    }

    public record Destination(
            String city,
            List<String> airports,
            String reason,
            @Schema(description = "TABLE: 관리 테이블, LLM: 테이블에 없어 Claude가 선정, USER: 사용자가 지정")
            String source) {
    }

    public record Recommendation(
            int rank,
            String city,
            String originAirport,
            String destinationAirport,
            String departDate,
            String returnDate,
            String airline,
            FlightOffer.FlightLeg outbound,
            FlightOffer.FlightLeg inbound,
            @Schema(description = "1인 왕복 가격(원), 세금 포함·위탁수하물 미포함 추정가")
            int pricePerPersonKrw,
            @Schema(description = "exact_date: 해당 날짜 가격 / date_range_estimate: 기간 최저가 등 추정")
            String priceBasis,
            Boolean baggageIncluded,
            @Schema(description = "현지 체류 가능 시간. 시각 정보가 없으면 null")
            Double stayHours,
            double score,
            String reason,
            List<String> sourceUrls,
            List<Link> bookingLinks) {
    }

    public record Link(String name, String url) {
    }

    public record Stats(long latencyMs, long webSearches, long inputTokens, long outputTokens, double estimatedCostUsd) {
    }
}
