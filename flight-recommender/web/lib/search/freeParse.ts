import { getVercelOidcToken } from "@vercel/oidc";
import { z } from "zod";

import { config } from "../config";
import { ApiError } from "../errors";
import { koWeekday } from "./dates";
import { TripQuerySchema, type TripQuery, type Usage } from "./types";

const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";

const SYSTEM_PROMPT = `너는 한국 사용자의 해외 항공권 검색 질문을 검색 조건 JSON으로 바꾸는 파서다.
출발지는 따로 정하므로 신경 쓰지 않는다.
- "11월 중"처럼 달만 말하면 그 달 1일~말일. 이미 지난 날짜는 오늘 이후로 당긴다.
- "평일"이면 weekdaysOnly=true. "1박2일"이면 nights=1.
- 국가·지역만 말했으면 그 목적에 맞는 도시 2~4개를 한국 직항이 있는 곳 위주로 고른다.
- 질문에 없는 값을 채웠으면 assumptions에 한국어로 짧게 적는다.

아래 JSON 스키마에 맞는 JSON 객체 하나만 출력한다. 설명 문장이나 코드블록 없이 JSON만.
${JSON.stringify(z.toJSONSchema(TripQuerySchema))}`;

type ChatResponse = {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * 무료 모드 질문 해석. Vercel AI Gateway 무료 등급 모델을 OpenAI 호환 API로 부른다.
 * Vercel에 배포된 함수는 OIDC 토큰으로 인증되므로 API 키가 필요 없다.
 */
export async function parseQuestionFree(question: string, today: string): Promise<{ query: TripQuery; usage: Usage }> {
  let token: string;
  try {
    token = process.env.AI_GATEWAY_API_KEY ?? (await getVercelOidcToken());
  } catch {
    throw new ApiError(503, "무료 AI에 연결하지 못했습니다. Vercel에 배포된 환경에서만 동작합니다.");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `오늘 날짜: ${today} (${koWeekday(today)}요일)\n질문: ${question}` },
  ];
  let usage: Usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };

  // 작은 무료 모델은 형식을 가끔 틀리므로 오류를 알려주고 한 번 더 시도한다
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ model: config.freeModel, messages, temperature: 0 }),
      signal: AbortSignal.timeout(40_000),
    });
    if (res.status === 429) {
      throw new ApiError(429, "무료 AI 사용량이 잠시 몰렸어요. 1분쯤 뒤에 다시 시도해주세요.");
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("AI Gateway 오류", res.status, detail.slice(0, 500));
      throw new ApiError(502, `무료 AI 호출에 실패했습니다 (${res.status}).`);
    }
    const body = (await res.json()) as ChatResponse;
    usage = {
      inputTokens: usage.inputTokens + (body.usage?.prompt_tokens ?? 0),
      outputTokens: usage.outputTokens + (body.usage?.completion_tokens ?? 0),
      webSearches: 0,
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = TripQuerySchema.safeParse(extractJson(content));
    if (parsed.success) {
      return { query: parsed.data, usage };
    }
    messages.push(
      { role: "assistant", content },
      { role: "user", content: `JSON이 스키마와 맞지 않습니다: ${parsed.error.issues[0]?.message}. 스키마에 맞는 JSON만 다시 출력하세요.` },
    );
  }
  throw new ApiError(502, "질문을 이해하지 못했습니다. 조금 더 구체적으로 다시 질문해주세요.");
}

/** 응답에서 JSON 객체 부분만 꺼낸다 (코드블록·앞뒤 설명·생각 태그 허용) */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
