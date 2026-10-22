package com.flightrec.search.usage;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** 검색 1회 기록. 일일 한도·월 예산 계산에 쓴다. */
@Entity
@Table(indexes = @Index(columnList = "inviteCode, createdAt"))
public class SearchLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String inviteCode;
    @Column(length = 500)
    private String question;
    private Instant createdAt;
    private long latencyMs;
    private long inputTokens;
    private long outputTokens;
    private long webSearches;
    private double costUsd;
    private int resultCount;
    private String error;

    protected SearchLog() {
    }

    public SearchLog(String inviteCode, String question) {
        this.inviteCode = inviteCode;
        this.question = question;
        this.createdAt = Instant.now();
    }

    public void finish(long latencyMs, long inputTokens, long outputTokens, long webSearches, double costUsd,
                       int resultCount, String error) {
        this.latencyMs = latencyMs;
        this.inputTokens = inputTokens;
        this.outputTokens = outputTokens;
        this.webSearches = webSearches;
        this.costUsd = costUsd;
        this.resultCount = resultCount;
        this.error = error;
    }
}
