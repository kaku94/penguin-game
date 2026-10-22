import { describe, expect, it } from "vitest";

import { addDays, dayOfWeek, generateDatePairs, todayInSeoul } from "./dates";
import type { TripQuery } from "./types";

const TODAY = "2026-10-22";

function query(dateFrom: string, dateTo: string, nights: number, weekdaysOnly: boolean, excluded: TripQuery["excludedWeekdays"] = []): TripQuery {
  return {
    purpose: "맛집",
    region: "일본",
    citiesExplicit: false,
    suggestedCities: [],
    dateFrom,
    dateTo,
    nights,
    weekdaysOnly,
    excludedWeekdays: excluded,
    passengers: 1,
    maxBudgetKrw: 0,
    assumptions: [],
  };
}

describe("generateDatePairs", () => {
  it("평일 1박2일은 주말에 걸치지 않고 주마다 고르게 퍼진다", () => {
    const pairs = generateDatePairs(query("2026-11-01", "2026-11-30", 1, true), TODAY, 8);

    expect(pairs).toHaveLength(8);
    for (const p of pairs) {
      expect(p.returnDate).toBe(addDays(p.depart, 1));
      expect([5, 6, 0]).not.toContain(dayOfWeek(p.depart)); // 금·토·일 출발 불가
    }
    const weeks = new Set(pairs.map((p) => Math.floor(Number(p.depart.slice(8)) / 7)));
    expect(weeks.size).toBeGreaterThanOrEqual(4);
    // 주마다 첫 선택은 화요일
    expect(pairs[0].depart).toBe("2026-11-03");
  });

  it("제외 요일과 지난 날짜는 빠진다", () => {
    const pairs = generateDatePairs(query("2026-10-01", "2026-10-31", 1, false, ["FRIDAY"]), TODAY, 50);

    expect(pairs.length).toBeGreaterThan(0);
    for (const p of pairs) {
      expect(p.depart > TODAY).toBe(true);
      expect(dayOfWeek(p.depart)).not.toBe(5);
      expect(dayOfWeek(p.returnDate)).not.toBe(5);
      expect(p.returnDate <= "2026-10-31").toBe(true);
    }
  });

  it("잘못된 날짜 형식은 예외", () => {
    expect(() => generateDatePairs(query("11월", "2026-11-30", 1, false), TODAY, 8)).toThrow(RangeError);
  });
});

describe("todayInSeoul", () => {
  it("UTC 15시 이후는 한국 날짜로 다음 날", () => {
    expect(todayInSeoul(new Date("2026-10-22T15:30:00Z"))).toBe("2026-10-23");
    expect(todayInSeoul(new Date("2026-10-22T14:59:00Z"))).toBe("2026-10-22");
  });
});
