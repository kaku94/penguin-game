import Anthropic from "@anthropic-ai/sdk";

import { ApiError } from "../errors";
import type { Usage } from "./types";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ApiError(503, "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  }
  client ??= new Anthropic();
  return client;
}

/** 거절(refusal) 시 서버 측에서 권장 모델로 자동 재시도. 지원하지 않는 모델에서는 무시된다. */
export const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
  fallbacks: "default" as const,
};

export function usageOf(usage: Anthropic.Beta.BetaUsage): Usage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    webSearches: usage.server_tool_use?.web_search_requests ?? 0,
  };
}
