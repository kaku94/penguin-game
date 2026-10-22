package com.flightrec.search.usage;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface SearchLogRepository extends JpaRepository<SearchLog, Long> {

    /** 진행 중이거나 성공한 검색만 센다. 설정 오류 등으로 실패한 검색은 한도에서 빼준다. */
    long countByInviteCodeAndCreatedAtGreaterThanEqualAndErrorIsNull(String inviteCode, Instant from);

    @Query("select coalesce(sum(l.costUsd), 0) from SearchLog l where l.createdAt >= :from")
    double sumCostSince(Instant from);
}
