package com.flightrec.search.flight;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.anthropic.core.JsonValue;
import com.anthropic.models.beta.messages.BetaMessage;
import com.anthropic.models.beta.messages.BetaMessageParam;
import com.anthropic.models.beta.messages.BetaOutputConfig;
import com.anthropic.models.beta.messages.BetaStopReason;
import com.anthropic.models.beta.messages.BetaTextBlock;
import com.anthropic.models.beta.messages.BetaWebSearchTool20260209;
import com.anthropic.models.beta.messages.MessageCreateParams;
import com.flightrec.common.ApiException;
import com.flightrec.config.AnthropicClientProvider;
import com.flightrec.config.AppProperties;
import com.flightrec.profile.CarrierPreference;
import com.flightrec.search.model.DatePair;
import com.flightrec.search.model.FlightOffer;
import com.flightrec.search.model.SearchResponse.Destination;
import com.flightrec.search.model.Usage;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * PRD F4: 도시 하나에 대해 Claude 웹 검색으로 후보 날짜들의 직항 왕복 가격을 모은다.
 * 웹 검색 결과에는 인용(citation)이 붙어 구조화 출력과 함께 쓸 수 없으므로, 마지막 ```json 블록을 파싱한다.
 */
@Component
public class FlightSearchClient {

    private static final Pattern JSON_BLOCK = Pattern.compile("```json\\s*(\\[.*?\\])\\s*```", Pattern.DOTALL);
    private static final int MAX_PAUSE_RESUMES = 4;

    private static final String SYSTEM_PROMPT = """
            너는 항공권 가격 조사원이다. 웹 검색으로 주어진 노선·날짜의 실제 가격을 찾는다.
            - 성인 1명, 이코노미, 직항 왕복. 가격은 원화, 세금·유류할증료 포함, 위탁수하물 미포함 기준
            - 출처에서 실제로 확인한 숫자만 쓴다. 가격·편명·시각을 지어내지 않는다. 모르면 null
            - 그 날짜의 가격이면 priceBasis "exact_date", "~원부터"·"월 최저가" 같은 범위 가격이면 "date_range_estimate"
            - 외화 가격만 있으면 원화로 환산한다
            - 시각은 현지 시각 HH:mm

            마지막에 찾은 항공권(최대 5개)을 아래 형식의 JSON 배열 하나로 ```json 코드블록에 출력한다.
            못 찾았으면 빈 배열 [] 을 출력한다.
            [{"originAirport":"ICN","destinationAirport":"FUK","departDate":"yyyy-MM-dd","returnDate":"yyyy-MM-dd",
              "airline":"...","outbound":{"flightNo":"...","depart":"HH:mm","arrive":"HH:mm"},
              "inbound":{"flightNo":"...","depart":"HH:mm","arrive":"HH:mm"},
              "priceKrw":123000,"priceBasis":"exact_date","baggageIncluded":false,"nonstop":true,
              "sourceUrls":["https://..."]}]""";

    private final AnthropicClientProvider clients;
    private final AppProperties.Anthropic config;
    private final JsonMapper jsonMapper;

    public FlightSearchClient(AnthropicClientProvider clients, AppProperties props, JsonMapper jsonMapper) {
        this.clients = clients;
        this.config = props.anthropic();
        this.jsonMapper = jsonMapper;
    }

    public Result search(List<String> origins, Destination destination, List<DatePair> datePairs,
                         CarrierPreference preference, int maxWebSearches) {
        List<BetaMessageParam> messages = new ArrayList<>();
        messages.add(BetaMessageParam.builder()
                .role(BetaMessageParam.Role.USER)
                .content(userPrompt(origins, destination, datePairs, preference))
                .build());

        Usage usage = Usage.ZERO;
        BetaMessage response = null;
        for (int i = 0; i <= MAX_PAUSE_RESUMES; i++) {
            MessageCreateParams.Builder builder = MessageCreateParams.builder()
                    .model(config.searchModel())
                    .maxTokens(16000L)
                    .system(SYSTEM_PROMPT)
                    .messages(messages)
                    .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.MEDIUM).build())
                    .addTool(BetaWebSearchTool20260209.builder().maxUses((long) maxWebSearches).build());
            if (config.fallbacksEnabled()) {
                builder.addBeta("server-side-fallback-2026-07-01")
                        .putAdditionalBodyProperty("fallbacks", JsonValue.from("default"));
            }
            response = clients.get().beta().messages().create(builder.build());
            usage = usage.plus(Usage.of(response.usage()));

            // 서버 도구가 반복 상한에 걸리면 pause_turn: 지금까지의 응답을 붙여 이어서 요청한다
            if (response.stopReason().filter(BetaStopReason.PAUSE_TURN::equals).isEmpty()) {
                break;
            }
            messages.add(response.toParam());
        }

        if (response.stopReason().filter(BetaStopReason.REFUSAL::equals).isPresent()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, destination.city() + " 검색 요청이 거절되었습니다.");
        }
        String text = response.content().stream()
                .flatMap(block -> block.text().stream())
                .map(BetaTextBlock::text)
                .collect(Collectors.joining());
        return new Result(parseOffers(text), usage);
    }

    private static String userPrompt(List<String> origins, Destination destination, List<DatePair> datePairs,
                                     CarrierPreference preference) {
        String dates = datePairs.stream()
                .map(p -> "- 출발 %s(%s) / 귀국 %s(%s)".formatted(p.depart(), p.depart().getDayOfWeek(),
                        p.returnDate(), p.returnDate().getDayOfWeek()))
                .collect(Collectors.joining("\n"));
        String carrier = switch (preference) {
            case ANY -> "항공사 무관";
            case LCC -> "저비용 항공사 선호";
            case FSC -> "대형 항공사 선호";
        };
        return """
                출발 공항: %s
                도착: %s (%s)
                후보 날짜 (이 중 싼 날짜 위주로):
                %s
                %s. 직항 왕복 최저가를 찾아줘.""".formatted(String.join(", ", origins), destination.city(),
                String.join(", ", destination.airports()), dates, carrier);
    }

    List<FlightOffer> parseOffers(String text) {
        Matcher matcher = JSON_BLOCK.matcher(text);
        String json = null;
        while (matcher.find()) {
            json = matcher.group(1);
        }
        if (json == null) {
            return List.of();
        }
        try {
            return List.of(jsonMapper.readValue(json, FlightOffer[].class));
        } catch (JacksonException e) {
            return List.of();
        }
    }

    public record Result(List<FlightOffer> offers, Usage usage) {
    }
}
