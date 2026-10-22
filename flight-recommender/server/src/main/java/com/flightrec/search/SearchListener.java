package com.flightrec.search;

import com.flightrec.search.model.SearchResponse.ParsedSummary;

/** 검색 진행상황 콜백 (PRD F8). SSE 스트리밍에서 쓰고, 동기 API는 무시한다. */
public interface SearchListener {

    SearchListener NONE = new SearchListener() {
    };

    default void progress(String message) {
    }

    default void parsed(ParsedSummary summary) {
    }
}
