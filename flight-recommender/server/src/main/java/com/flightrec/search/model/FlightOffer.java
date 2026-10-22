package com.flightrec.search.model;

import java.util.List;

/**
 * 웹 검색으로 찾은 항공권 한 건. LLM 출력에서 바로 역직렬화하므로 날짜·시각은 문자열로 받고
 * 랭킹 단계에서 검증한다.
 */
public record FlightOffer(
        String originAirport,
        String destinationAirport,
        String departDate,
        String returnDate,
        String airline,
        FlightLeg outbound,
        FlightLeg inbound,
        Integer priceKrw,
        /** exact_date | date_range_estimate */
        String priceBasis,
        Boolean baggageIncluded,
        boolean nonstop,
        List<String> sourceUrls) {

    public record FlightLeg(String flightNo, String depart, String arrive) {
    }
}
