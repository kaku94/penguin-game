/** /api/openapi 로 내보내는 API 명세. 라우트를 바꾸면 여기도 같이 고친다. */
const problem = {
  description: "오류 (problem+json)",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
};

const searchBody = {
  required: true,
  content: {
    "application/json": {
      schema: {
        type: "object",
        required: ["question"],
        properties: {
          question: {
            type: "string",
            maxLength: 500,
            example: "맛집투어하러 1박2일 평일에 일본 여행갈려는데 11월중에 싼 항공권 있나?",
          },
        },
      },
    },
  },
};

const leg = {
  type: "object",
  nullable: true,
  properties: { flightNo: { type: "string" }, depart: { type: "string", example: "07:30" }, arrive: { type: "string" } },
};

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "항공권 추천 API",
    version: "0.2.0",
    description:
      "자연어 질문으로 항공권 후보를 추천합니다. 오른쪽 위 Authorize 버튼에 초대코드를 넣고 호출하세요.\n" +
      "스트리밍(SSE) 엔드포인트는 Swagger UI에서 한 번에 표시되므로, 결과 확인은 /api/search/sync 가 편합니다.",
  },
  security: [{ inviteCode: [] }],
  tags: [
    { name: "검색", description: "자연어 질문으로 항공권 추천" },
    { name: "프로필", description: "기본 출발 공항 등 사용자 설정" },
  ],
  paths: {
    "/api/search": {
      post: {
        tags: ["검색"],
        summary: "항공권 추천 (스트리밍)",
        description:
          "Server-Sent Events로 진행상황과 결과를 보냅니다.\n" +
          "- progress: {message}\n- parsed: ParsedSummary\n- result: SearchResponse\n- error: {status, detail}",
        requestBody: searchBody,
        responses: {
          "200": { description: "이벤트 스트림", content: { "text/event-stream": { schema: { type: "string" } } } },
          "400": problem,
          "401": problem,
        },
      },
    },
    "/api/search/sync": {
      post: {
        tags: ["검색"],
        summary: "항공권 추천 (한 번에 응답)",
        requestBody: searchBody,
        responses: {
          "200": {
            description: "추천 결과",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } },
          },
          "400": problem,
          "401": problem,
          "429": problem,
          "503": problem,
        },
      },
    },
    "/api/profile": {
      get: {
        tags: ["프로필"],
        summary: "내 프로필 조회",
        description: "저장한 적이 없으면 기본값(ICN, GMP / 항공사 무관)을 돌려줍니다.",
        responses: {
          "200": { description: "프로필", content: { "application/json": { schema: { $ref: "#/components/schemas/Profile" } } } },
          "401": problem,
        },
      },
      put: {
        tags: ["프로필"],
        summary: "내 프로필 저장",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Profile" } } },
        },
        responses: {
          "200": { description: "저장된 프로필", content: { "application/json": { schema: { $ref: "#/components/schemas/Profile" } } } },
          "400": problem,
          "401": problem,
        },
      },
    },
  },
  components: {
    securitySchemes: { inviteCode: { type: "apiKey", in: "header", name: "X-Invite-Code" } },
    schemas: {
      Problem: { type: "object", properties: { status: { type: "integer" }, detail: { type: "string" } } },
      Profile: {
        type: "object",
        required: ["homeAirports", "carrierPreference"],
        properties: {
          homeAirports: { type: "array", items: { type: "string" }, example: ["ICN", "GMP"] },
          carrierPreference: { type: "string", enum: ["ANY", "LCC", "FSC"] },
        },
      },
      Destination: {
        type: "object",
        properties: {
          city: { type: "string" },
          airports: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
          source: { type: "string", enum: ["TABLE", "LLM", "USER"] },
        },
      },
      ParsedSummary: {
        type: "object",
        properties: {
          purpose: { type: "string" },
          origins: { type: "array", items: { type: "string" } },
          destinations: { type: "array", items: { $ref: "#/components/schemas/Destination" } },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          nights: { type: "integer" },
          weekdaysOnly: { type: "boolean" },
          passengers: { type: "integer" },
          datePairs: { type: "array", items: { type: "string" } },
          assumptions: { type: "array", items: { type: "string" } },
        },
      },
      Recommendation: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          city: { type: "string" },
          originAirport: { type: "string" },
          destinationAirport: { type: "string" },
          departDate: { type: "string" },
          returnDate: { type: "string" },
          airline: { type: "string", nullable: true },
          outbound: leg,
          inbound: leg,
          pricePerPersonKrw: { type: "integer", description: "1인 왕복, 세금 포함·위탁수하물 미포함 추정가" },
          priceBasis: { type: "string", nullable: true, enum: ["exact_date", "date_range_estimate", null] },
          baggageIncluded: { type: "boolean", nullable: true },
          stayHours: { type: "number", nullable: true },
          score: { type: "number" },
          reason: { type: "string" },
          sourceUrls: { type: "array", items: { type: "string" } },
          bookingLinks: {
            type: "array",
            items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" } } },
          },
        },
      },
      SearchResponse: {
        type: "object",
        properties: {
          question: { type: "string" },
          parsed: { $ref: "#/components/schemas/ParsedSummary" },
          recommendations: { type: "array", items: { $ref: "#/components/schemas/Recommendation" } },
          partial: { type: "boolean" },
          notices: { type: "array", items: { type: "string" } },
          stats: {
            type: "object",
            properties: {
              latencyMs: { type: "integer" },
              webSearches: { type: "integer" },
              inputTokens: { type: "integer" },
              outputTokens: { type: "integer" },
              estimatedCostUsd: { type: "number" },
            },
          },
        },
      },
    },
  },
} as const;
