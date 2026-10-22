package com.flightrec.config;

import static com.flightrec.auth.InviteCodeFilter.HEADER;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfig {

    private static final String SCHEME = "inviteCode";

    @Bean
    public OpenAPI openApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("항공권 추천 API")
                        .version("0.1.0")
                        .description("""
                                자연어 질문으로 항공권 후보를 추천합니다.
                                오른쪽 위 Authorize 버튼에 초대코드를 넣고 호출하세요.
                                스트리밍(SSE) 엔드포인트는 Swagger UI에서 한 번에 표시되므로,
                                결과 확인은 /api/search/sync 가 편합니다."""))
                .components(new Components().addSecuritySchemes(SCHEME, new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.HEADER)
                        .name(HEADER)))
                .addSecurityItem(new SecurityRequirement().addList(SCHEME));
    }
}
