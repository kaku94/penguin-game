import type Anthropic from "@anthropic-ai/sdk";

import { config } from "../config";
import { ApiError } from "../errors";
import { FALLBACK, anthropic, usageOf } from "./claude";
import { koWeekday } from "./dates";
import {
  FlightOfferSchema,
  ZERO_USAGE,
  addUsage,
  type CarrierPreference,
  type DatePair,
  type Destination,
  type FlightOffer,
  type Usage,
} from "./types";

const MAX_PAUSE_RESUMES = 4;

const SYSTEM_PROMPT = `너는 항공권 가격 조사원이다. 웹 검색으로 주어진 노선·날짜의 실제 가격을 찾는다.
- 성인 1명, 이코노미, 직항 왕복. 가격은 원화, 세금·유류할증료 포함, 위탁수하물 미포함 기준
- 출처에서 실제로 확인한 숫자만 쓴다. 가격·편명·시각을 지어내지 않는다. 모르면 null
- 그 날짜의 가격이면 priceBasis "exact_date", "~원부터"·"월 최저가" 같은 범위 가격이면 "date_range_estimate"
- 외화 가격만 있으면 원화로 환산한다
- 시각은 현지 시각 HH:mm

마지막에 찾은 항공권(최대 5개)을 아래 형식의 JSON 배열 하나로 \`\`\`json 코드블록에 출력한다.
못 찾았으면 빈 배열 [] 을 출력한다.
[{"originAirport":"ICN","destinationAirport":"FUK","departDate":"YYYY-MM-DD","returnDate":"YYYY-MM-DD",
  "airline":"...","outbound":{"flightNo":"...","depart":"HH:mm","arrive":"HH:mm"},
  "inbound":{"flightNo":"...","depart":"HH:mm","arrive":"HH:mm"},
  "priceKrw":123000,"priceBasis":"exact_date","baggageIncluded":false,"nonstop":true,
  "sourceUrls":["https://..."]}]`;

const CARRIER_TEXT: Record<CarrierPreference, string> = {
  ANY: "항공사 무관",
  LCC: "저비용 항공사 선호",
  FSC: "대형 항공사 선호",
};

/**
 * PRD F4: 도시 하나에 대해 Claude 웹 검색으로 후보 날짜들의 직항 왕복 가격을 모은다.
 * 웹 검색 결과에는 인용(citation)이 붙어 구조화 출력과 함께 쓸 수 없으므로, 마지막 ```json 블록을 파싱한다.
 */
export async function searchFlights(
  origins: string[],
  destination: Destination,
  datePairs: DatePair[],
  preference: CarrierPreference,
  maxWebSearches: number,
  signal?: AbortSignal,
): Promise<{ offers: FlightOffer[]; usage: Usage }> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: userPrompt(origins, destination, datePairs, preference) },
  ];

  let usage = ZERO_USAGE;
  let response: Anthropic.Beta.BetaMessage | undefined;
  for (let i = 0; i <= MAX_PAUSE_RESUMES; i++) {
    response = await anthropic().beta.messages.create(
      {
        model: config.searchModel,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages,
        output_config: { effort: "medium" },
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxWebSearches }],
        ...FALLBACK,
      },
      { signal },
    );
    usage = addUsage(usage, usageOf(response.usage));
    // 서버 도구가 반복 상한에 걸리면 pause_turn: 지금까지의 응답을 붙여 이어서 요청한다
    if (response.stop_reason !== "pause_turn") {
      break;
    }
    messages.push({ role: "assistant", content: response.content });
  }

  if (response?.stop_reason === "refusal") {
    throw new ApiError(422, `${destination.city} 검색 요청이 거절되었습니다.`);
  }
  const text = (response?.content ?? [])
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  return { offers: parseOffers(text), usage };
}

function userPrompt(origins: string[], destination: Destination, datePairs: DatePair[], preference: CarrierPreference) {
  const dates = datePairs
    .map((p) => `- 출발 ${p.depart}(${koWeekday(p.depart)}) / 귀국 ${p.returnDate}(${koWeekday(p.returnDate)})`)
    .join("\n");
  return `출발 공항: ${origins.join(", ")}
도착: ${destination.city} (${destination.airports.join(", ")})
후보 날짜 (이 중 싼 날짜 위주로):
${dates}
${CARRIER_TEXT[preference]}. 직항 왕복 최저가를 찾아줘.`;
}

/** 마지막 ```json 배열 블록에서 형식에 맞는 항목만 꺼낸다. */
export function parseOffers(text: string): FlightOffer[] {
  const blocks = [...text.matchAll(/```json\s*(\[[\s\S]*?\])\s*```/g)];
  const json = blocks.at(-1)?.[1];
  if (!json) {
    return [];
  }
  let items: unknown;
  try {
    items = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(items)) {
    return [];
  }
  return items.flatMap((item) => {
    const parsed = FlightOfferSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
