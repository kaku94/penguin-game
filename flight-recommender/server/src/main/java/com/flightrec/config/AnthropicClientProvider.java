package com.flightrec.config;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.flightrec.common.ApiException;

/** API 키 없이도 서버(Swagger 포함)는 뜨도록, 클라이언트는 처음 쓸 때 만든다. */
@Component
public class AnthropicClientProvider {

    private final String apiKey;
    private volatile AnthropicClient client;

    public AnthropicClientProvider(AppProperties props) {
        this.apiKey = props.anthropic().apiKey();
    }

    public AnthropicClient get() {
        if (client == null) {
            synchronized (this) {
                if (client == null) {
                    if (apiKey == null || apiKey.isBlank()) {
                        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                                "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
                    }
                    client = AnthropicOkHttpClient.builder().apiKey(apiKey).build();
                }
            }
        }
        return client;
    }
}
