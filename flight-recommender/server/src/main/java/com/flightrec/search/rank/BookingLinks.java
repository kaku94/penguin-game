package com.flightrec.search.rank;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

import com.flightrec.search.model.SearchResponse.Link;

/** PRD F7: 같은 조건이 채워진 검색 링크. 추정가를 사용자가 직접 검증하는 용도. */
public final class BookingLinks {

    private static final DateTimeFormatter YYMMDD = DateTimeFormatter.ofPattern("yyMMdd");
    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.BASIC_ISO_DATE;

    private BookingLinks() {
    }

    public static List<Link> of(String origin, String destination, LocalDate depart, LocalDate ret, int adults) {
        String google = "https://www.google.com/travel/flights?hl=ko&curr=KRW&q=" + URLEncoder.encode(
                "Flights from %s to %s on %s through %s nonstop %d adult".formatted(origin, destination, depart, ret, adults),
                StandardCharsets.UTF_8);
        String skyscanner = "https://www.skyscanner.co.kr/transport/flights/%s/%s/%s/%s/?adultsv2=%d&rtn=1".formatted(
                origin.toLowerCase(), destination.toLowerCase(), depart.format(YYMMDD), ret.format(YYMMDD), adults);
        String naver = "https://flight.naver.com/flights/international/%s-%s-%s/%s-%s-%s?adult=%d&fareType=Y".formatted(
                origin, destination, depart.format(YYYYMMDD), destination, origin, ret.format(YYYYMMDD), adults);
        return List.of(new Link("Google 항공권", google), new Link("스카이스캐너", skyscanner), new Link("네이버 항공권", naver));
    }
}
