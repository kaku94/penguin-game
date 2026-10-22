import { config } from "../config";
import { bookingLinks } from "./bookingLinks";
import { toEpochDay } from "./dates";
import type { FlightOffer, Recommendation } from "./types";

/** 시각 정보가 없어 체류시간을 모를 때의 시간효율점수 */
export const UNKNOWN_TIME_SCORE = 0.3;
export const RED_EYE_PENALTY = 0.1;

export type CityOffer = { city: string; offer: FlightOffer };

type Candidate = {
  city: string;
  offer: FlightOffer;
  price: number;
  outboundDepart: number | null;
  outboundArrive: number | null;
  inboundDepart: number | null;
  inboundArrive: number | null;
  stayHours: number | null;
};

type Weights = { priceWeight: number; timeWeight: number; maxResults: number };

/**
 * PRD §6 추천 로직. LLM이 아닌 코드로 계산해 같은 입력이면 같은 순위가 나온다.
 * 점수 = 가격 가중치 × 가격점수 + 시간 가중치 × 시간효율점수 − 새벽 비행 감점
 */
export function rank(
  offers: CityOffer[],
  nights: number,
  passengers: number,
  maxBudgetKrw: number,
  weights: Weights = config.search,
): Recommendation[] {
  const candidates = dedupe(
    offers.flatMap((o) => {
      const c = toCandidate(o);
      return c && (maxBudgetKrw <= 0 || c.price <= maxBudgetKrw) ? [c] : [];
    }),
  );
  if (candidates.length === 0) {
    return [];
  }

  const minPrice = Math.min(...candidates.map((c) => c.price));
  const tripWindowHours = (nights + 1) * 24;
  const stayRatios = candidates.flatMap((c) => (c.stayHours === null ? [] : [c.stayHours / tripWindowHours]));
  const maxStayRatio = stayRatios.length > 0 ? Math.max(...stayRatios) : 1;

  return candidates
    .map((c) => {
      const priceScore = minPrice / c.price;
      const timeScore = c.stayHours === null ? UNKNOWN_TIME_SCORE : c.stayHours / tripWindowHours / maxStayRatio;
      const penalty = (isRedEye(c.outboundDepart) ? RED_EYE_PENALTY : 0) + (isRedEye(c.inboundArrive) ? RED_EYE_PENALTY : 0);
      return { c, score: weights.priceWeight * priceScore + weights.timeWeight * timeScore - penalty };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, weights.maxResults)
    .map(({ c, score }, i) => {
      const o = c.offer;
      return {
        rank: i + 1,
        city: c.city,
        originAirport: o.originAirport,
        destinationAirport: o.destinationAirport,
        departDate: o.departDate,
        returnDate: o.returnDate,
        airline: o.airline ?? null,
        outbound: o.outbound ?? null,
        inbound: o.inbound ?? null,
        pricePerPersonKrw: c.price,
        priceBasis: o.priceBasis ?? null,
        baggageIncluded: o.baggageIncluded ?? null,
        stayHours: c.stayHours === null ? null : Math.round(c.stayHours * 10) / 10,
        score: Math.round(score * 1000) / 1000,
        reason: reason(c, minPrice),
        sourceUrls: o.sourceUrls,
        bookingLinks: bookingLinks(o.originAirport, o.destinationAirport, o.departDate, o.returnDate, passengers),
      };
    });
}

/** 직항·가격·출처·날짜가 없는 결과는 버린다 (PRD §10: 출처 없는 가격 제외). */
function toCandidate({ city, offer: o }: CityOffer): Candidate | null {
  if (!o.nonstop || !o.priceKrw || o.priceKrw <= 0 || o.sourceUrls.length === 0) {
    return null;
  }
  let departDay: number;
  let returnDay: number;
  try {
    departDay = toEpochDay(o.departDate);
    returnDay = toEpochDay(o.returnDate);
  } catch {
    return null;
  }
  if (returnDay < departDay) {
    return null;
  }
  const outboundArrive = minutes(o.outbound?.arrive);
  const inboundDepart = minutes(o.inbound?.depart);
  // 도착 시각과 귀국편 출발 시각은 둘 다 현지 시각이라 시차 보정 없이 뺄 수 있다
  let stayHours =
    outboundArrive === null || inboundDepart === null
      ? null
      : ((returnDay - departDay) * 1440 + inboundDepart - outboundArrive) / 60;
  if (stayHours !== null && stayHours <= 0) {
    stayHours = null;
  }
  return {
    city,
    offer: o,
    price: Math.round(o.priceKrw),
    outboundDepart: minutes(o.outbound?.depart),
    outboundArrive,
    inboundDepart,
    inboundArrive: minutes(o.inbound?.arrive),
    stayHours,
  };
}

/** 같은 도시·날짜 조합은 가장 싼 것 하나만 (결과 다양성) */
function dedupe(candidates: Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.city}|${c.offer.departDate}|${c.offer.returnDate}`;
    const current = best.get(key);
    if (!current || c.price < current.price) {
      best.set(key, c);
    }
  }
  return [...best.values()];
}

function minutes(hhmm: string | null | undefined): number | null {
  const m = hhmm?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) {
    return null;
  }
  const value = Number(m[1]) * 60 + Number(m[2]);
  return value < 24 * 60 ? value : null;
}

function isRedEye(mins: number | null): boolean {
  return mins !== null && mins >= 60 && mins < 300;
}

function reason(c: Candidate, minPrice: number): string {
  const parts: string[] = [];
  parts.push(c.price === minPrice ? "후보 중 최저가" : `최저가보다 ${Math.round(((c.price - minPrice) * 100) / minPrice)}% 비쌈`);
  if (c.stayHours !== null) {
    parts.push(`현지 체류 약 ${Math.round(c.stayHours)}시간`);
  }
  const earlyArrival = c.outboundArrive !== null && c.outboundArrive < 11 * 60;
  const lateReturn = c.inboundDepart !== null && c.inboundDepart >= 18 * 60;
  if (earlyArrival && lateReturn) {
    parts.push("오전 도착·저녁 귀국이라 일정이 꽉 참");
  } else if (earlyArrival) {
    parts.push("오전 도착");
  } else if (lateReturn) {
    parts.push("저녁 귀국");
  }
  if (isRedEye(c.outboundDepart) || isRedEye(c.inboundArrive)) {
    parts.push("새벽 비행 포함");
  }
  if (c.offer.priceBasis === "date_range_estimate") {
    parts.push("※ 날짜별 가격이 아닌 기간 추정가");
  }
  return parts.join(", ");
}
