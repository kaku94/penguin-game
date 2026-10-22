import { bookingLinks } from "./bookingLinks";
import { dayOfWeek, koWeekday } from "./dates";
import type { DatePair, Destination, Suggestion } from "./types";

const PAIRS_PER_CITY = 3;

const WEEKDAY_TIP: Record<number, string> = {
  2: "화요일 출발은 보통 주중에서 가장 싼 편",
  3: "수요일 출발도 비교적 싼 편",
  1: "월요일 출발은 주말 수요가 빠져 무난한 편",
  4: "목요일 출발은 주말 앞이라 조금 오를 수 있음",
};

/**
 * 무료 모드: 가격 검색 없이 도시마다 싼 편인 요일의 날짜 조합을 골라 예약 링크와 함께 보여준다.
 * 날짜 조합은 이미 화·수 출발을 우선해 골라져 있으므로(dates.ts) 도시마다 앞에서 몇 개만 쓴다.
 */
export function suggest(cities: Destination[], datePairs: DatePair[], origins: string[], passengers: number): Suggestion[] {
  const preferred = [...datePairs].sort((a, b) => rank(a) - rank(b) || a.depart.localeCompare(b.depart));
  const origin = origins[0] ?? "ICN";
  return cities.flatMap((city) =>
    preferred.slice(0, PAIRS_PER_CITY).map((pair) => {
      const destination = city.airports[0];
      const tip = WEEKDAY_TIP[dayOfWeek(pair.depart)];
      return {
        city: city.city,
        originAirport: origin,
        destinationAirport: destination,
        departDate: pair.depart,
        returnDate: pair.returnDate,
        reason: [city.reason, tip ?? `${koWeekday(pair.depart)}요일 출발`].filter(Boolean).join(" · "),
        bookingLinks: bookingLinks(origin, destination, pair.depart, pair.returnDate, passengers),
      };
    }),
  );
}

function rank(pair: DatePair): number {
  const order = [2, 3, 1, 4, 0, 6, 5];
  return order.indexOf(dayOfWeek(pair.depart));
}
