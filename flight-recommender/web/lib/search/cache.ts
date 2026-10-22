import { createHash } from "node:crypto";

import { config } from "../config";
import { db } from "../db";
import { searchFlights } from "./flightSearch";
import { ZERO_USAGE, type CarrierPreference, type DatePair, type Destination, type FlightOffer, type Usage } from "./types";

/** 같은 출발지·도착지·날짜 조합은 cacheTtl 동안 웹 검색을 다시 하지 않는다 (PRD §7, §9). */
export async function cachedSearchFlights(
  origins: string[],
  destination: Destination,
  datePairs: DatePair[],
  preference: CarrierPreference,
  maxWebSearches: number,
  signal?: AbortSignal,
): Promise<{ offers: FlightOffer[]; usage: Usage }> {
  const key = createHash("sha256")
    .update(
      [config.searchModel, origins.join(","), destination.airports.join(","), JSON.stringify(datePairs), preference].join("|"),
    )
    .digest("hex");
  const freshAfter = new Date(Date.now() - config.search.cacheTtlMs);

  const sql = await db();
  const [cached] = await sql<{ offers: FlightOffer[] }[]>`
    select offers from search_cache where cache_key = ${key} and created_at > ${freshAfter}`;
  if (cached) {
    return { offers: cached.offers, usage: ZERO_USAGE };
  }

  const result = await searchFlights(origins, destination, datePairs, preference, maxWebSearches, signal);
  // 못 찾은 결과까지 캐시하면 일시적 실패가 TTL 동안 굳으므로 찾은 경우만 저장
  if (result.offers.length > 0) {
    await sql`
      insert into search_cache (cache_key, offers, created_at)
      values (${key}, ${sql.json(result.offers)}, now())
      on conflict (cache_key) do update set offers = excluded.offers, created_at = now()`;
  }
  return result;
}
