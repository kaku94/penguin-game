package com.flightrec.search.model;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;

/** 자연어 질문을 Claude 구조화 출력으로 해석한 결과. 필드 설명이 그대로 JSON 스키마 설명이 된다. */
public record TripQuery(
        @JsonPropertyDescription("여행 목적. 예: 맛집, 온천, 쇼핑, 휴양. 알 수 없으면 빈 문자열")
        String purpose,
        @JsonPropertyDescription("목적지 국가나 지역. 예: 일본, 동남아. 사용자가 도시만 말했으면 그 도시가 속한 국가")
        String region,
        @JsonPropertyDescription("사용자가 특정 도시를 직접 말했으면 true, 국가·지역만 말했으면 false")
        boolean citiesExplicit,
        @JsonPropertyDescription("후보 도시 2~4개. citiesExplicit=true면 사용자가 말한 도시만. 목적에 맞는 순서로")
        List<CitySuggestion> suggestedCities,
        @JsonPropertyDescription("출발 가능한 가장 이른 날짜, yyyy-MM-dd")
        String dateFrom,
        @JsonPropertyDescription("귀국해야 하는 가장 늦은 날짜, yyyy-MM-dd")
        String dateTo,
        @JsonPropertyDescription("숙박 일수. 1박2일이면 1, 당일치기면 0")
        int nights,
        @JsonPropertyDescription("여행 날짜가 모두 평일(월~금)이어야 하면 true")
        boolean weekdaysOnly,
        @JsonPropertyDescription("여행에서 빼야 하는 요일. MONDAY..SUNDAY 영문 대문자")
        List<String> excludedWeekdays,
        @JsonPropertyDescription("인원 수. 언급이 없으면 1")
        int passengers,
        @JsonPropertyDescription("1인 왕복 예산 상한(원). 언급이 없으면 0")
        int maxBudgetKrw,
        @JsonPropertyDescription("질문에 없어서 가정한 내용을 한국어 짧은 문장으로. 예: '인원 언급이 없어 1명으로 가정'")
        List<String> assumptions) {

    public record CitySuggestion(
            @JsonPropertyDescription("도시 이름(한국어)")
            String city,
            @JsonPropertyDescription("이 도시의 국제선 공항 IATA 코드, 여러 개면 콤마로. 예: NRT,HND")
            String airportCodes,
            @JsonPropertyDescription("이 목적에 이 도시를 고른 이유 한 줄")
            String reason) {
    }
}
