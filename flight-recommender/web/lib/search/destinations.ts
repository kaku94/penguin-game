import { check, db } from "../supabase";
import type { Destination, TripQuery } from "./types";

type CityMappingRow = { city: string; airport_codes: string[]; reason: string };

/** PRD F2: 사용자가 지정한 도시 → 관리 테이블 → LLM 제안 순으로 후보 도시를 정한다. */
export async function resolveDestinations(query: TripQuery, maxCities: number): Promise<Destination[]> {
  if (query.citiesExplicit) {
    return fromSuggestions(query, "USER", maxCities);
  }
  const mapped =
    check(
    await db()
      .from("city_mappings")
      .select("city, airport_codes, reason")
      .eq("region", query.region)
      .eq("purpose", query.purpose)
      .order("id")
      .limit(maxCities)
      .returns<CityMappingRow[]>(),
    ) ?? [];
  if (mapped.length > 0) {
    return mapped.map((m) => ({ city: m.city, airports: m.airport_codes, reason: m.reason, source: "TABLE" }));
  }
  const suggested = fromSuggestions(query, "LLM", maxCities);
  // 테이블에 추가할 후보로 검토하려고 남긴다 (PRD F2)
  console.info("도시 매핑 LLM 폴백", { region: query.region, purpose: query.purpose, cities: suggested.map((d) => d.city) });
  return suggested;
}

function fromSuggestions(query: TripQuery, source: Destination["source"], maxCities: number): Destination[] {
  return query.suggestedCities
    .map((c) => ({ ...c, airportCodes: c.airportCodes.map((a) => a.trim().toUpperCase()).filter((a) => /^[A-Z]{3}$/.test(a)) }))
    .filter((c) => c.airportCodes.length > 0)
    .slice(0, maxCities)
    .map((c) => ({ city: c.city, airports: c.airportCodes, reason: c.reason, source }));
}
