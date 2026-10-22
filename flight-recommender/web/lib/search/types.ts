import { z } from "zod";

/** 자연어 질문을 Claude 구조화 출력으로 해석한 결과. describe()가 그대로 JSON 스키마 설명이 된다. */
export const TripQuerySchema = z.object({
  purpose: z.string().describe("여행 목적. 예: 맛집, 온천, 쇼핑, 휴양. 알 수 없으면 빈 문자열"),
  region: z.string().describe("목적지 국가나 지역. 예: 일본, 동남아. 사용자가 도시만 말했으면 그 도시가 속한 국가"),
  citiesExplicit: z.boolean().describe("사용자가 특정 도시를 직접 말했으면 true, 국가·지역만 말했으면 false"),
  suggestedCities: z
    .array(
      z.object({
        city: z.string().describe("도시 이름(한국어)"),
        airportCodes: z.array(z.string()).describe("이 도시의 국제선 공항 IATA 코드. 예: [\"NRT\", \"HND\"]"),
        reason: z.string().describe("이 목적에 이 도시를 고른 이유 한 줄"),
      }),
    )
    .describe("후보 도시 2~4개. citiesExplicit=true면 사용자가 말한 도시만. 목적에 맞는 순서로"),
  dateFrom: z.string().describe("출발 가능한 가장 이른 날짜, YYYY-MM-DD"),
  dateTo: z.string().describe("귀국해야 하는 가장 늦은 날짜, YYYY-MM-DD"),
  nights: z.number().int().describe("숙박 일수. 1박2일이면 1, 당일치기면 0"),
  weekdaysOnly: z.boolean().describe("여행 날짜가 모두 평일(월~금)이어야 하면 true"),
  excludedWeekdays: z
    .array(z.enum(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]))
    .describe("여행에서 빼야 하는 요일"),
  passengers: z.number().int().describe("인원 수. 언급이 없으면 1"),
  maxBudgetKrw: z.number().int().describe("1인 왕복 예산 상한(원). 언급이 없으면 0"),
  assumptions: z.array(z.string()).describe("질문에 없어서 가정한 내용을 한국어 짧은 문장으로"),
});
export type TripQuery = z.infer<typeof TripQuerySchema>;

const Leg = z.object({
  flightNo: z.string().nullish(),
  depart: z.string().nullish(),
  arrive: z.string().nullish(),
});

/** 웹 검색으로 찾은 항공권 한 건. LLM 출력이라 느슨하게 받고 랭킹 단계에서 다시 거른다. */
export const FlightOfferSchema = z.object({
  originAirport: z.string(),
  destinationAirport: z.string(),
  departDate: z.string(),
  returnDate: z.string(),
  airline: z.string().nullish(),
  outbound: Leg.nullish(),
  inbound: Leg.nullish(),
  priceKrw: z.number().nullish(),
  priceBasis: z.string().nullish(),
  baggageIncluded: z.boolean().nullish(),
  nonstop: z.boolean().default(true),
  sourceUrls: z.array(z.string()).default([]),
});
export type FlightOffer = z.infer<typeof FlightOfferSchema>;
export type FlightLeg = z.infer<typeof Leg>;

export type CarrierPreference = "ANY" | "LCC" | "FSC";

export type DatePair = { depart: string; returnDate: string };

export type Destination = {
  city: string;
  airports: string[];
  reason: string;
  /** TABLE: 관리 테이블, LLM: 테이블에 없어 Claude가 선정, USER: 사용자가 지정 */
  source: "TABLE" | "LLM" | "USER";
};

export type Usage = { inputTokens: number; outputTokens: number; webSearches: number };
export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0, webSearches: 0 };
export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    webSearches: a.webSearches + b.webSearches,
  };
}

export type ParsedSummary = {
  purpose: string;
  origins: string[];
  destinations: Destination[];
  dateFrom: string;
  dateTo: string;
  nights: number;
  weekdaysOnly: boolean;
  passengers: number;
  datePairs: string[];
  assumptions: string[];
};

export type Link = { name: string; url: string };

export type Recommendation = {
  rank: number;
  city: string;
  originAirport: string;
  destinationAirport: string;
  departDate: string;
  returnDate: string;
  airline: string | null;
  outbound: FlightLeg | null;
  inbound: FlightLeg | null;
  /** 1인 왕복 가격(원), 세금 포함·위탁수하물 미포함 추정가 */
  pricePerPersonKrw: number;
  /** exact_date: 해당 날짜 가격 / date_range_estimate: 기간 최저가 등 추정 */
  priceBasis: string | null;
  baggageIncluded: boolean | null;
  /** 현지 체류 가능 시간. 시각 정보가 없으면 null */
  stayHours: number | null;
  score: number;
  reason: string;
  sourceUrls: string[];
  bookingLinks: Link[];
};

export type SearchResponse = {
  question: string;
  parsed: ParsedSummary;
  recommendations: Recommendation[];
  /** 시간 제한에 걸려 일부 도시 검색 결과가 빠졌으면 true */
  partial: boolean;
  notices: string[];
  stats: { latencyMs: number; webSearches: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number };
};
