import { createHash } from "node:crypto";

import { config } from "../config";
import { check, db } from "../supabase";
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
  const freshAfter = new Date(Date.now() - config.search.cacheTtlMs).toISOString();

  const cached = check(
    await db()
      .from("search_cache")
      .select("offers")
      .eq("cache_key", key)
      .gt("created_at", freshAfter)
      .maybeSingle<{ offers: FlightOffer[] }>(),
  );
  if (cached) {
    return { offers: cached.offers, usage: ZERO_USAGE };
  }

  const result = await searchFlights(origins, destination, datePairs, preference, maxWebSearches, signal);
  // 못 찾은 결과까지 캐시하면 일시적 실패가 TTL 동안 굳으므로 찾은 경우만 저장
  if (result.offers.length > 0) {
    check(
      await db()
        .from("search_cache")
        .upsert({ cache_key: key, offers: result.offers, created_at: new Date().toISOString() }),
    );
  }
  return result;
}
