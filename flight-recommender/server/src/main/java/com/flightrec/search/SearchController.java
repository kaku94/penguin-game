package com.flightrec.search;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.flightrec.auth.InviteCode;
import com.flightrec.auth.InviteCodeFilter;
import com.flightrec.common.ApiException;
import com.flightrec.search.model.SearchResponse;
import com.flightrec.search.model.SearchResponse.ParsedSummary;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Tag(name = "검색", description = "자연어 질문으로 항공권 추천")
@RestController
@RequestMapping("/api/search")
public class SearchController {

    private static final Logger log = LoggerFactory.getLogger(SearchController.class);
    private static final long SSE_TIMEOUT_MS = 120_000;

    private final SearchService service;
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public SearchController(SearchService service) {
        this.service = service;
    }

    @Operation(summary = "항공권 추천 (스트리밍)", description = """
            Server-Sent Events로 진행상황과 결과를 보냅니다. 이벤트 종류:
            - progress: {"message": "..."} 진행상황
            - parsed: 해석한 조건 (ParsedSummary)
            - result: 최종 결과 (SearchResponse)
            - error: {"status": 429, "detail": "..."}""")
    @PostMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@Parameter(hidden = true) @RequestAttribute(InviteCodeFilter.ATTRIBUTE) InviteCode invite,
                             @Valid @RequestBody SearchRequest request) {
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);
        executor.submit(() -> {
            try {
                SearchResponse response = service.search(request.question(), invite, new SearchListener() {
                    @Override
                    public void progress(String message) {
                        send(emitter, "progress", Map.of("message", message));
                    }

                    @Override
                    public void parsed(ParsedSummary summary) {
                        send(emitter, "parsed", summary);
                    }
                });
                send(emitter, "result", response);
            } catch (ApiException e) {
                send(emitter, "error", Map.of("status", e.status().value(), "detail", e.getMessage()));
            } catch (RuntimeException e) {
                log.error("검색 실패", e);
                send(emitter, "error", Map.of("status", HttpStatus.INTERNAL_SERVER_ERROR.value(),
                        "detail", "검색 중 오류가 발생했습니다."));
            }
            emitter.complete();
        });
        return emitter;
    }

    @Operation(summary = "항공권 추천 (한 번에 응답)", description = "스트리밍 없이 최종 결과만 돌려줍니다. Swagger에서 테스트할 때 편합니다.")
    @PostMapping("/sync")
    public SearchResponse sync(@Parameter(hidden = true) @RequestAttribute(InviteCodeFilter.ATTRIBUTE) InviteCode invite,
                               @Valid @RequestBody SearchRequest request) {
        return service.search(request.question(), invite, SearchListener.NONE);
    }

    /** 클라이언트가 연결을 끊어도 검색은 끝까지 돌려 사용량을 기록한다. */
    private static void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(data, MediaType.APPLICATION_JSON));
        } catch (IOException | IllegalStateException e) {
            log.debug("SSE 전송 실패 (클라이언트 연결 끊김): {}", e.getMessage());
        }
    }

    public record SearchRequest(
            @Schema(example = "맛집투어하러 1박2일 평일에 일본 여행갈려는데 11월중에 싼 항공권 있나?")
            @NotBlank @Size(max = 500) String question) {
    }
}
