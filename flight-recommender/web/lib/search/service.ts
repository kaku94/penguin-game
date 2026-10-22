import type { Invite } from "../auth";
import { config, costUsd } from "../config";
import { ApiError } from "../errors";
import { getProfile } from "../profile";
import { cachedSearchFlights } from "./cache";
import { generateDatePairs, todayInSeoul } from "./dates";
import { resolveDestinations } from "./destinations";
import { parseQuestionFree } from "./freeParse";
import { parseQuestion } from "./parse";
import { parseQuestionRules } from "./ruleParse";
import { suggest } from "./suggest";
import { rank, type CityOffer } from "./rank";
import { ZERO_USAGE, addUsage, type ParsedSummary, type SearchResponse, type TripQuery, type Usage } from "./types";
import { checkUsage, finishSearchLog, startSearchLog } from "./usage";

/** 검색 진행상황 콜백 (PRD F8). SSE 스트리밍에서 쓰고, 동기 API는 무시한다. */
export type SearchListener = {
  progress?: (message: string) => void;
  parsed?: (summary: ParsedSummary) => void;
};

/** 질문 해석 → 후보 도시·날짜 → 도시별 병렬 웹 검색 → 랭킹 (PRD §7). */
export async function search(question: string, invite: Invite, listener: SearchListener = {}): Promise<SearchResponse> {
  await checkUsage(invite);
  const logId = await startSearchLog(invite.code, question);
  const start = Date.now();
  const usage = { current: ZERO_USAGE };
  try {
    const response = await run(question, invite, listener, start, usage);
    await finishSearchLog(logId, {
      latency_ms: response.stats.latencyMs,
      input_tokens: response.stats.inputTokens,
      output_tokens: response.stats.outputTokens,
      web_searches: response.stats.webSearches,
      cost_usd: response.stats.estimatedCostUsd,
      result_count: response.recommendations.length,
      error: null,
    });
    return response;
  } catch (e) {
    const u = usage.current;
    await finishSearchLog(logId, {
      latency_ms: Date.now() - start,
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      web_searches: u.webSearches,
      cost_usd: costUsd(u.inputTokens, u.outputTokens, u.webSearches),
      result_count: 0,
      error: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e),
    });
    throw e;
  }
}

async function run(
  question: string,
  invite: Invite,
  listener: SearchListener,
  start: number,
  usage: { current: Usage },
): Promise<SearchResponse> {
  const today = todayInSeoul();
  const profile = await getProfile(invite.code);

  listener.progress?.("질문을 해석하는 중...");
  const parsed = config.mode === "free" ? await parseFree(question, today) : await parseQuestion(question, today);
  const query = parsed.query;
  usage.current = parsed.usage;

  const cities = await resolveDestinations(query, config.search.maxCities);
  if (cities.length === 0) {
    throw new ApiError(400, "목적지를 정하지 못했습니다. 나라나 도시를 넣어 다시 질문해주세요.");
  }
  let datePairs;
  try {
    datePairs = generateDatePairs(query, today, config.search.maxDatePairs);
  } catch {
    throw new ApiError(400, "여행 날짜를 이해하지 못했습니다. 기간을 넣어 다시 질문해주세요.");
  }
  if (datePairs.length === 0) {
    throw new ApiError(400, "조건에 맞는 날짜 조합이 없습니다. 기간이나 요일 조건을 넓혀주세요.");
  }

  const passengers = Math.max(1, query.passengers);
  const origins = profile.homeAirports;
  const summary: ParsedSummary = {
    purpose: query.purpose,
    origins,
    destinations: cities,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    nights: query.nights,
    weekdaysOnly: query.weekdaysOnly,
    passengers,
    datePairs: datePairs.map((p) => `${p.depart}~${p.returnDate}`),
    assumptions: query.assumptions,
  };
  listener.parsed?.(summary);

  if (config.mode === "free") {
    const u = usage.current;
    return {
      question,
      mode: "free",
      parsed: summary,
      recommendations: [],
      suggestions: suggest(cities, datePairs, origins, passengers),
      partial: false,
      notices: [
        "무료 체험판이라 가격은 찾지 않았어요. 싼 편인 요일 위주로 날짜를 골랐으니, 예약 링크를 눌러 실제 가격을 확인하세요.",
      ],
      stats: {
        latencyMs: Date.now() - start,
        webSearches: 0,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        estimatedCostUsd: 0,
      },
    };
  }

  // 남은 시간이 지나면 진행 중인 검색을 끊고 모인 결과로 응답한다 (PRD §8 부분 응답)
  const remainingMs = Math.max(0, config.search.timeoutMs - (Date.now() - start));
  const deadline = AbortSignal.timeout(remainingMs);
  const searchesPerCity = Math.max(1, Math.floor(config.search.maxWebSearches / cities.length));
  const results = await Promise.allSettled(
    cities.map(async (city) => {
      listener.progress?.(`${city.city} 검색 중...`);
      const result = await cachedSearchFlights(origins, city, datePairs, profile.carrierPreference, searchesPerCity, deadline);
      listener.progress?.(`${city.city} 검색 완료 (후보 ${result.offers.length}개)`);
      return { city, result };
    }),
  );

  const offers: CityOffer[] = [];
  const notices = ["가격은 웹 검색으로 찾은 1인 왕복 추정가(세금 포함, 위탁수하물 미포함)입니다. 예약 링크에서 꼭 확인하세요."];
  let partial = false;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      usage.current = addUsage(usage.current, r.value.result.usage);
      r.value.result.offers.forEach((offer) => offers.push({ city: r.value.city.city, offer }));
    } else if (deadline.aborted) {
      partial = true;
    } else {
      console.warn(`${cities[i].city} 검색 실패`, r.reason);
      notices.push(`${cities[i].city} 검색에 실패했습니다.`);
    }
  });
  if (partial) {
    notices.push("시간 제한으로 일부 도시 결과가 빠졌습니다.");
  }

  listener.progress?.("후보를 비교하는 중...");
  const recommendations = rank(offers, Math.max(0, query.nights), passengers, query.maxBudgetKrw);
  if (recommendations.length === 0) {
    notices.push("출처가 확인된 직항 가격을 찾지 못했습니다. 날짜나 도시를 바꿔 다시 시도해보세요.");
  }

  const u = usage.current;
  return {
    question,
    mode: "claude",
    parsed: summary,
    recommendations,
    suggestions: [],
    partial,
    notices,
    stats: {
      latencyMs: Date.now() - start,
      webSearches: u.webSearches,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      estimatedCostUsd: Math.round(costUsd(u.inputTokens, u.outputTokens, u.webSearches) * 10000) / 10000,
    },
  };
}

/**
 * 무료 모드 해석: 규칙 기반 파서가 먼저, 목적지를 못 찾으면 AI Gateway 무료 모델에 맡긴다.
 * (AI Gateway는 Vercel 계정에 카드가 등록돼 있어야 동작하므로 실패해도 안내만 한다.)
 */
async function parseFree(question: string, today: string): Promise<{ query: TripQuery; usage: Usage }> {
  const query = parseQuestionRules(question, today);
  if (query) {
    return { query, usage: ZERO_USAGE };
  }
  try {
    return await parseQuestionFree(question, today);
  } catch (e) {
    console.warn("무료 AI 해석 실패", e);
    throw new ApiError(
      400,
      "어디로 갈지 알아듣지 못했어요. 나라나 도시 이름을 넣어 다시 물어봐주세요. 예: '11월 평일에 오사카 1박2일'",
    );
  }
}
