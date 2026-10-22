package com.flightrec.search;

import java.time.LocalDate;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.anthropic.core.JsonValue;
import com.anthropic.models.beta.messages.BetaOutputConfig;
import com.anthropic.models.beta.messages.BetaStopReason;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.anthropic.models.beta.messages.StructuredMessage;
import com.anthropic.models.beta.messages.StructuredMessageCreateParams;
import com.anthropic.models.beta.messages.StructuredTextBlock;
import com.flightrec.common.ApiException;
import com.flightrec.config.AnthropicClientProvider;
import com.flightrec.config.AppProperties;
import com.flightrec.search.model.TripQuery;
import com.flightrec.search.model.Usage;

/** PRD F1·F2: 자연어 질문 → 여행 조건 + 후보 도시(LLM 폴백용). */
@Component
public class QueryParser {

    static final String FALLBACK_BETA = "server-side-fallback-2026-07-01";

    private static final String SYSTEM_PROMPT = """
            너는 한국 사용자의 해외 항공권 검색 질문을 검색 조건으로 바꾸는 파서다.
            출발지는 사용자 프로필에서 따로 정하므로 신경 쓰지 않는다.
            - "11월 중"처럼 달만 말하면 그 달 1일~말일. 이미 지난 날짜는 오늘 이후로 당긴다.
            - "평일"이면 weekdaysOnly=true. "1박2일"이면 nights=1.
            - 국가·지역만 말했으면 그 목적에 맞는 도시 2~4개를 한국 직항이 있는 곳 위주로 고른다.
            - 질문에 없는 값을 채웠으면 assumptions에 한국어로 짧게 적는다.""";

    private final AnthropicClientProvider clients;
    private final AppProperties.Anthropic config;

    public QueryParser(AnthropicClientProvider clients, AppProperties props) {
        this.clients = clients;
        this.config = props.anthropic();
    }

    public Parsed parse(String question, LocalDate today) {
        StructuredMessageCreateParams.Builder<TripQuery> builder = MessageCreateParams.builder()
                .model(config.parseModel())
                .maxTokens(8000L)
                .system(SYSTEM_PROMPT)
                .outputConfig(TripQuery.class, BetaOutputConfig.Effort.LOW)
                .addUserMessage("오늘 날짜: %s (%s)\n질문: %s".formatted(today, today.getDayOfWeek(), question));
        if (config.fallbacksEnabled()) {
            builder.addBeta(FALLBACK_BETA).putAdditionalBodyProperty("fallbacks", JsonValue.from("default"));
        }

        StructuredMessage<TripQuery> response = clients.get().beta().messages().create(builder.build());
        if (response.stopReason().filter(BetaStopReason.REFUSAL::equals).isPresent()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "이 질문은 처리할 수 없습니다.");
        }
        TripQuery query = response.content().stream()
                .flatMap(block -> block.text().stream())
                .map(StructuredTextBlock::text)
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.BAD_GATEWAY, "질문 해석 결과가 비어 있습니다."));
        return new Parsed(query, Usage.of(response.usage()));
    }

    public record Parsed(TripQuery query, Usage usage) {
    }
}
