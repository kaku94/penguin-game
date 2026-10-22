import { describe, expect, it } from "vitest";

import { parseQuestionRules } from "./ruleParse";

const TODAY = "2026-10-22";

describe("parseQuestionRules", () => {
  it("대표 질문: 목적·나라·평일·1박2일·11월", () => {
    const q = parseQuestionRules("맛집투어하러 1박2일 평일에 일본 여행갈려는데 11월중에 싼 항공권 있나?", TODAY);

    expect(q).toMatchObject({
      purpose: "맛집",
      region: "일본",
      citiesExplicit: false,
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
      nights: 1,
      weekdaysOnly: true,
      passengers: 1,
      maxBudgetKrw: 0,
    });
    expect(q!.suggestedCities.map((c) => c.city)).toEqual(["오사카", "후쿠오카", "도쿄"]);
  });

  it("도시 지정·제외 요일·인원·예산, 지난 달은 내년으로", () => {
    const q = parseQuestionRules("2월에 후쿠오카 2박3일 둘이서, 금요일 출발은 빼고 30만원 이하", TODAY);

    expect(q).toMatchObject({
      citiesExplicit: true,
      region: "일본",
      dateFrom: "2027-02-01",
      dateTo: "2027-02-28",
      nights: 2,
      excludedWeekdays: ["FRIDAY"],
      passengers: 2,
      maxBudgetKrw: 300_000,
    });
    expect(q!.suggestedCities).toEqual([{ city: "후쿠오카", airportCodes: ["FUK"], reason: expect.any(String) }]);
  });

  it("다음 달, 기본값과 가정 안내", () => {
    const q = parseQuestionRules("다음 달에 베트남 가고 싶어", TODAY);

    expect(q).toMatchObject({ dateFrom: "2026-11-01", dateTo: "2026-11-30", nights: 2, region: "동남아" });
    expect(q!.assumptions.join(" ")).toContain("2박3일");
  });

  it("목적지가 없으면 null", () => {
    expect(parseQuestionRules("11월에 싼 비행기 있어?", TODAY)).toBeNull();
  });
});
