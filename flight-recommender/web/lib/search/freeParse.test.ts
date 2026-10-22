import { describe, expect, it } from "vitest";

import { extractJson } from "./freeParse";
import { suggest } from "./suggest";

describe("extractJson", () => {
  it("코드블록·생각 태그·앞뒤 설명이 있어도 JSON만 꺼낸다", () => {
    expect(extractJson('<think>{"x":0}</think>네, 결과입니다:\n```json\n{"a": 1, "b": {"c": 2}}\n```')).toEqual({
      a: 1,
      b: { c: 2 },
    });
  });

  it("JSON이 없거나 깨지면 null", () => {
    expect(extractJson("모르겠어요")).toBeNull();
    expect(extractJson("{bad json}")).toBeNull();
  });
});

describe("suggest", () => {
  it("도시마다 화·수 출발을 먼저 3개씩, 첫 출발 공항과 첫 도착 공항으로 링크를 만든다", () => {
    const pairs = [
      { depart: "2026-11-02", returnDate: "2026-11-03" }, // 월
      { depart: "2026-11-04", returnDate: "2026-11-05" }, // 수
      { depart: "2026-11-05", returnDate: "2026-11-06" }, // 목
      { depart: "2026-11-10", returnDate: "2026-11-11" }, // 화
    ];
    const cities = [{ city: "도쿄", airports: ["NRT", "HND"], reason: "스시", source: "TABLE" as const }];

    const result = suggest(cities, pairs, ["ICN", "GMP"], 2);

    expect(result.map((s) => s.departDate)).toEqual(["2026-11-10", "2026-11-04", "2026-11-02"]);
    expect(result[0]).toMatchObject({ originAirport: "ICN", destinationAirport: "NRT" });
    expect(result[0].reason).toContain("화요일");
    expect(result[0].bookingLinks[2].url).toContain("adult=2");
  });
});
