import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

import { config } from "../config";
import { ApiError } from "../errors";
import { FALLBACK, anthropic, usageOf } from "./claude";
import { koWeekday } from "./dates";
import { TripQuerySchema, type TripQuery, type Usage } from "./types";

const SYSTEM_PROMPT = `너는 한국 사용자의 해외 항공권 검색 질문을 검색 조건으로 바꾸는 파서다.
출발지는 사용자 프로필에서 따로 정하므로 신경 쓰지 않는다.
- "11월 중"처럼 달만 말하면 그 달 1일~말일. 이미 지난 날짜는 오늘 이후로 당긴다.
- "평일"이면 weekdaysOnly=true. "1박2일"이면 nights=1.
- 국가·지역만 말했으면 그 목적에 맞는 도시 2~4개를 한국 직항이 있는 곳 위주로 고른다.
- 질문에 없는 값을 채웠으면 assumptions에 한국어로 짧게 적는다.`;

/** PRD F1·F2: 자연어 질문 → 여행 조건 + 후보 도시(LLM 폴백용). */
export async function parseQuestion(question: string, today: string): Promise<{ query: TripQuery; usage: Usage }> {
  const response = await anthropic().beta.messages.parse({
    model: config.parseModel,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: betaZodOutputFormat(TripQuerySchema) },
    messages: [{ role: "user", content: `오늘 날짜: ${today} (${koWeekday(today)}요일)\n질문: ${question}` }],
    ...FALLBACK,
  });
  if (response.stop_reason === "refusal") {
    throw new ApiError(422, "이 질문은 처리할 수 없습니다.");
  }
  if (!response.parsed_output) {
    throw new ApiError(502, "질문 해석 결과가 비어 있습니다.");
  }
  return { query: response.parsed_output, usage: usageOf(response.usage) };
}
