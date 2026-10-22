package com.flightrec.search.usage;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import com.flightrec.auth.InviteCode;
import com.flightrec.common.ApiException;
import com.flightrec.config.AppProperties;

/** PRD F10, §9: 초대코드별 일일 한도와 전체 월 예산. */
@Component
public class UsageGuard {

    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private final SearchLogRepository repository;
    private final AppProperties props;

    public UsageGuard(SearchLogRepository repository, AppProperties props) {
        this.repository = repository;
        this.props = props;
    }

    @Transactional(readOnly = true)
    public void check(InviteCode invite) {
        LocalDate today = LocalDate.now(ZONE);
        Instant startOfDay = today.atStartOfDay(ZONE).toInstant();
        if (repository.countByInviteCodeAndCreatedAtGreaterThanEqualAndErrorIsNull(invite.getCode(), startOfDay) >= invite.getDailyLimit()) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "오늘 검색 한도(%d회)를 다 썼습니다. 내일 다시 시도해주세요.".formatted(invite.getDailyLimit()));
        }
        Instant startOfMonth = today.withDayOfMonth(1).atStartOfDay(ZONE).toInstant();
        if (repository.sumCostSince(startOfMonth) >= props.search().monthlyBudgetUsd()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "이번 달 운영 예산을 다 써서 검색을 잠시 멈췄습니다.");
        }
    }
}
