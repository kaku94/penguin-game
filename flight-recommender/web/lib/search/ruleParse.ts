import { addDays, fromEpochDay, toEpochDay } from "./dates";
import type { TripQuery } from "./types";

/**
 * 무료 모드용 규칙 기반 질문 해석. AI 없이 키워드와 정규식으로 여행 조건을 뽑는다.
 * 목적지를 못 찾으면 null (호출한 쪽에서 다시 물어본다).
 */

type City = { names: string[]; city: string; airports: string[]; region: string; reason: string };

const CITIES: City[] = [
  { names: ["오사카", "교토", "나라"], city: "오사카", airports: ["KIX"], region: "일본", reason: "간사이 지역의 관문" },
  { names: ["후쿠오카", "유후인", "벳푸"], city: "후쿠오카", airports: ["FUK"], region: "일본", reason: "비행 1시간대로 가장 가까움" },
  { names: ["도쿄", "동경"], city: "도쿄", airports: ["NRT", "HND"], region: "일본", reason: "볼거리·먹거리 선택지가 가장 많음" },
  { names: ["삿포로", "홋카이도"], city: "삿포로", airports: ["CTS"], region: "일본", reason: "온천·설경" },
  { names: ["오키나와"], city: "오키나와", airports: ["OKA"], region: "일본", reason: "바다·리조트" },
  { names: ["나고야"], city: "나고야", airports: ["NGO"], region: "일본", reason: "히쓰마부시·미소카츠" },
  { names: ["방콕"], city: "방콕", airports: ["BKK"], region: "동남아", reason: "길거리 음식·쇼핑" },
  { names: ["다낭"], city: "다낭", airports: ["DAD"], region: "동남아", reason: "해변 리조트, 물가 저렴" },
  { names: ["나트랑", "냐짱"], city: "나트랑", airports: ["CXR"], region: "동남아", reason: "해변 휴양" },
  { names: ["하노이"], city: "하노이", airports: ["HAN"], region: "동남아", reason: "쌀국수·분짜" },
  { names: ["세부"], city: "세부", airports: ["CEB"], region: "동남아", reason: "다이빙·리조트" },
  { names: ["타이베이", "타이페이"], city: "타이베이", airports: ["TPE"], region: "동남아", reason: "야시장·우육면" },
  { names: ["홍콩"], city: "홍콩", airports: ["HKG"], region: "동남아", reason: "딤섬·야경" },
  { names: ["싱가포르"], city: "싱가포르", airports: ["SIN"], region: "동남아", reason: "도시 여행·호커센터" },
  { names: ["괌"], city: "괌", airports: ["GUM"], region: "동남아", reason: "가까운 휴양지" },
];

/** 나라·지역 이름 → (매핑 테이블의 지역, 기본 후보 도시) */
const REGIONS: { names: string[]; region: string; defaults: string[] }[] = [
  { names: ["일본"], region: "일본", defaults: ["오사카", "후쿠오카", "도쿄"] },
  { names: ["동남아"], region: "동남아", defaults: ["다낭", "방콕", "세부"] },
  { names: ["베트남"], region: "동남아", defaults: ["다낭", "나트랑", "하노이"] },
  { names: ["태국"], region: "동남아", defaults: ["방콕"] },
  { names: ["대만"], region: "동남아", defaults: ["타이베이"] },
  { names: ["필리핀"], region: "동남아", defaults: ["세부"] },
];

const PURPOSES: { words: string[]; purpose: string }[] = [
  { words: ["맛집", "먹방", "미식", "먹으러", "음식"], purpose: "맛집" },
  { words: ["온천"], purpose: "온천" },
  { words: ["쇼핑"], purpose: "쇼핑" },
  { words: ["휴양", "바다", "리조트", "해변", "쉬러"], purpose: "휴양" },
];

const KO_DAYS: Record<string, TripQuery["excludedWeekdays"][number]> = {
  월: "MONDAY",
  화: "TUESDAY",
  수: "WEDNESDAY",
  목: "THURSDAY",
  금: "FRIDAY",
  토: "SATURDAY",
  일: "SUNDAY",
};

export function parseQuestionRules(question: string, today: string): TripQuery | null {
  const q = question.replace(/\s+/g, " ");
  const assumptions: string[] = [];

  // 목적지: 도시 이름이 있으면 그 도시들, 없으면 나라·지역의 기본 후보
  const mentioned = CITIES.filter((c) => c.names.some((n) => q.includes(n)));
  const region = REGIONS.find((r) => r.names.some((n) => q.includes(n)));
  let cities: City[];
  let citiesExplicit = false;
  if (mentioned.length > 0) {
    cities = mentioned;
    citiesExplicit = true;
  } else if (region) {
    cities = region.defaults.map((name) => CITIES.find((c) => c.city === name)!);
  } else {
    return null;
  }

  const purpose = PURPOSES.find((p) => p.words.some((w) => q.includes(w)))?.purpose ?? "";

  // 기간: "N월" / "이번 달" / "다음 달", 없으면 내일부터 30일
  const [ty, tm] = today.split("-").map(Number);
  let month: { year: number; month: number } | null = null;
  const monthMatch = q.match(/(\d{1,2})\s*월/);
  if (monthMatch) {
    const m = Number(monthMatch[1]);
    if (m >= 1 && m <= 12) {
      month = { year: m >= tm ? ty : ty + 1, month: m };
    }
  } else if (q.includes("이번 달") || q.includes("이번달")) {
    month = { year: ty, month: tm };
  } else if (q.includes("다음 달") || q.includes("다음달")) {
    month = tm === 12 ? { year: ty + 1, month: 1 } : { year: ty, month: tm + 1 };
  }
  let dateFrom: string;
  let dateTo: string;
  if (month) {
    dateFrom = `${month.year}-${String(month.month).padStart(2, "0")}-01`;
    const next = month.month === 12 ? `${month.year + 1}-01-01` : `${month.year}-${String(month.month + 1).padStart(2, "0")}-01`;
    dateTo = fromEpochDay(toEpochDay(next) - 1);
  } else {
    dateFrom = addDays(today, 1);
    dateTo = addDays(today, 30);
    assumptions.push("기간 언급이 없어 앞으로 30일 안에서 찾았어요");
  }

  // 숙박: "N박M일" / "N박" / "당일"
  let nights: number;
  const stay = q.match(/(\d)\s*박/);
  if (stay) {
    nights = Number(stay[1]);
  } else if (q.includes("당일")) {
    nights = 0;
  } else {
    nights = 2;
    assumptions.push("일정 언급이 없어 2박3일로 가정했어요");
  }

  const weekdaysOnly = q.includes("평일");

  // "금요일(출발)은 빼고", "금요일 제외"
  const excludedWeekdays: TripQuery["excludedWeekdays"] = [];
  for (const m of q.matchAll(/([월화수목금토일])요일[^,.]{0,6}?(빼|제외)/g)) {
    excludedWeekdays.push(KO_DAYS[m[1]]);
  }

  // 인원: "2명", "3인", "둘이", "혼자"
  let passengers = 1;
  const people = q.match(/(\d+)\s*(명|인)/);
  if (people) {
    passengers = Number(people[1]);
  } else if (/둘이|두 ?명|커플|부부/.test(q)) {
    passengers = 2;
  } else if (!q.includes("혼자")) {
    assumptions.push("인원 언급이 없어 1명으로 가정했어요");
  }

  // 예산: "20만원 이하"
  const budget = q.match(/(\d+)\s*만\s*원/);
  const maxBudgetKrw = budget ? Number(budget[1]) * 10_000 : 0;

  return {
    purpose,
    region: region?.region ?? cities[0].region,
    citiesExplicit,
    suggestedCities: cities.map((c) => ({ city: c.city, airportCodes: c.airports, reason: c.reason })),
    dateFrom,
    dateTo,
    nights,
    weekdaysOnly,
    excludedWeekdays,
    passengers,
    maxBudgetKrw,
    assumptions,
  };
}
