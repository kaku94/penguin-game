/** 서버 설정. 값은 환경변수로 덮어쓸 수 있다. */
export const config = {
  parseModel: process.env.PARSE_MODEL ?? "claude-opus-5-5",
  searchModel: process.env.SEARCH_MODEL ?? "claude-opus-5-5",
  // 비용 추정용 단가 (USD). 실제 단가는 Anthropic 가격표로 확인
  inputPricePerMtok: Number(process.env.INPUT_PRICE_PER_MTOK ?? 4),
  outputPricePerMtok: Number(process.env.OUTPUT_PRICE_PER_MTOK ?? 20),
  webSearchPrice: Number(process.env.WEB_SEARCH_PRICE ?? 0.01),

  search: {
    maxWebSearches: 8,
    maxCities: 3,
    maxDatePairs: 8,
    maxResults: 5,
    // Vercel 함수 제한(60초) 안에 응답하도록
    timeoutMs: 50_000,
    cacheTtlMs: 6 * 60 * 60 * 1000,
    priceWeight: 0.6,
    timeWeight: 0.4,
    // 약 1만원. 넘으면 그 달은 검색 중단
    monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? 7),
  },
} as const;

export function costUsd(inputTokens: number, outputTokens: number, webSearches: number): number {
  return (
    (inputTokens * config.inputPricePerMtok + outputTokens * config.outputPricePerMtok) / 1_000_000 +
    webSearches * config.webSearchPrice
  );
}
