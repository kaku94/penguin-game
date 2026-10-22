import { describe, expect, it } from "vitest";

import { parseOffers } from "./flightSearch";
import { RED_EYE_PENALTY, rank } from "./rank";
import type { FlightOffer } from "./types";

const WEIGHTS = { priceWeight: 0.6, timeWeight: 0.4, maxResults: 5 };

function offer(dest: string, depart: string, ret: string, times: [string, string, string, string], price: number): FlightOffer {
  return {
    originAirport: "ICN",
    destinationAirport: dest,
    departDate: depart,
    returnDate: ret,
    airline: "테스트항공",
    outbound: { flightNo: "TS1", depart: times[0], arrive: times[1] },
    inbound: { flightNo: "TS2", depart: times[2], arrive: times[3] },
    priceKrw: price,
    priceBasis: "exact_date",
    baggageIncluded: false,
    nonstop: true,
    sourceUrls: [`https://example.com/${depart}`],
  };
}

describe("rank", () => {
  it("조금 비싸도 체류시간이 길면 앞선다", () => {
    const cheapShortStay = offer("FUK", "2026-11-18", "2026-11-19", ["15:00", "16:20", "10:00", "11:30"], 100_000);
    const longStay = offer("FUK", "2026-11-17", "2026-11-18", ["07:30", "08:50", "20:40", "22:10"], 105_000);

    const result = rank(
      [
        { city: "후쿠오카", offer: cheapShortStay },
        { city: "후쿠오카", offer: longStay },
      ],
      1,
      1,
      0,
      WEIGHTS,
    );

    expect(result.map((r) => r.departDate)).toEqual(["2026-11-17", "2026-11-18"]);
    expect(result[0].stayHours).toBeCloseTo(35.8, 1);
    expect(result[0].reason).toContain("오전 도착·저녁 귀국");
    expect(result[0].bookingLinks).toHaveLength(3);
  });

  it("출처가 없거나 경유거나 예산을 넘으면 제외", () => {
    const base = offer("KIX", "2026-11-17", "2026-11-18", ["09:00", "10:50", "19:00", "21:00"], 90_000);
    const offers = [
      { ...base, sourceUrls: [] },
      { ...base, departDate: "2026-11-18", returnDate: "2026-11-19", nonstop: false },
      offer("KIX", "2026-11-24", "2026-11-25", ["09:00", "10:50", "19:00", "21:00"], 300_000),
      offer("KIX", "2026-11-25", "2026-11-26", ["09:00", "10:50", "19:00", "21:00"], 150_000),
    ];

    const result = rank(offers.map((o) => ({ city: "오사카", offer: o })), 1, 2, 200_000, WEIGHTS);

    expect(result).toHaveLength(1);
    expect(result[0].pricePerPersonKrw).toBe(150_000);
    expect(result[0].reason).toContain("후보 중 최저가");
    expect(result[0].bookingLinks[1].url).toContain("adultsv2=2");
  });

  it("체류시간과 가격이 같으면 새벽 도착편이 뒤로", () => {
    const redEye = offer("BKK", "2026-11-16", "2026-11-18", ["09:00", "12:50", "23:00", "02:30"], 300_000);
    const day = offer("BKK", "2026-11-17", "2026-11-19", ["09:00", "12:50", "23:00", "06:30"], 300_000);

    const result = rank(
      [
        { city: "방콕", offer: redEye },
        { city: "방콕", offer: day },
      ],
      2,
      1,
      0,
      WEIGHTS,
    );

    expect(result[1].departDate).toBe("2026-11-16");
    expect(result[1].reason).toContain("새벽 비행");
    expect(result[0].score - result[1].score).toBeCloseTo(RED_EYE_PENALTY, 3);
  });
});

describe("parseOffers", () => {
  it("마지막 json 블록에서 형식이 맞는 항목만 꺼낸다", () => {
    const text = [
      "중간 메모 ```json\n[]\n```",
      "결과:",
      "```json",
      JSON.stringify([
        { originAirport: "ICN", destinationAirport: "FUK", departDate: "2026-11-17", returnDate: "2026-11-18", priceKrw: 120000, sourceUrls: ["https://a"] },
        { destinationAirport: "FUK" },
      ]),
      "```",
    ].join("\n");

    const offers = parseOffers(text);

    expect(offers).toHaveLength(1);
    expect(offers[0].nonstop).toBe(true);
  });

  it("json 블록이 없거나 깨지면 빈 배열", () => {
    expect(parseOffers("못 찾았어요")).toEqual([]);
    expect(parseOffers("```json\n[{bad\n```")).toEqual([]);
  });
});
