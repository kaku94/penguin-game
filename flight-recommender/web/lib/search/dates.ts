import type { DatePair, TripQuery } from "./types";

/**
 * 날짜는 모두 "YYYY-MM-DD" 문자열로 다룬다. 계산은 UTC 자정 기준 epoch day로 해서 시간대 영향을 받지 않는다.
 */
const DAY_MS = 86_400_000;
export const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function toEpochDay(ymd: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new RangeError(`날짜 형식이 아님: ${ymd}`);
  }
  const ms = Date.parse(`${ymd}T00:00:00Z`);
  if (Number.isNaN(ms)) {
    throw new RangeError(`날짜 형식이 아님: ${ymd}`);
  }
  return ms / DAY_MS;
}

export function fromEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(ymd: string, days: number): string {
  return fromEpochDay(toEpochDay(ymd) + days);
}

/** 0=일요일 … 6=토요일 */
export function dayOfWeek(ymd: string): number {
  return (toEpochDay(ymd) + 4) % 7; // 1970-01-01은 목요일
}

export function koWeekday(ymd: string): string {
  return KO_WEEKDAYS[dayOfWeek(ymd)];
}

/** 한국 시간 기준 오늘 */
export function todayInSeoul(now = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 보통 화·수 출발이 싸서 먼저 고른다. */
const PREFERRED_DEPARTURE = [2, 3, 1, 4, 0, 6, 5];

/** PRD F3: 조건에 맞는 출발·귀국일 조합을 만들고, 검색 횟수 상한에 맞게 고른다. */
export function generateDatePairs(query: TripQuery, today: string, maxPairs: number): DatePair[] {
  let from = toEpochDay(query.dateFrom);
  const to = toEpochDay(query.dateTo);
  const todayDay = toEpochDay(today);
  if (from <= todayDay) {
    from = todayDay + 1;
  }
  const nights = Math.max(0, query.nights);
  const excluded = new Set(query.excludedWeekdays.map((w) => WEEKDAYS.indexOf(w)));

  const all: number[] = [];
  for (let depart = from; depart + nights <= to; depart++) {
    let ok = true;
    for (let d = depart; d <= depart + nights; d++) {
      const dow = (d + 4) % 7;
      if ((query.weekdaysOnly && (dow === 0 || dow === 6)) || excluded.has(dow)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      all.push(depart);
    }
  }

  return pickSpread(all, maxPairs).map((d) => ({ depart: fromEpochDay(d), returnDate: fromEpochDay(d + nights) }));
}

/** 주마다 선호 요일 순으로 하나씩 돌아가며 골라 기간 전체에 고르게 퍼뜨린다. */
function pickSpread(departures: number[], maxPairs: number): number[] {
  const byWeek = new Map<number, number[]>();
  for (const d of departures) {
    const week = Math.floor((d - 4) / 7); // 1970-01-05(월)부터 월요일 시작 주
    byWeek.set(week, [...(byWeek.get(week) ?? []), d]);
  }
  const rank = (d: number) => PREFERRED_DEPARTURE.indexOf((d + 4) % 7);
  const weeks = [...byWeek.values()].map((w) => w.sort((a, b) => rank(a) - rank(b)));

  const picked: number[] = [];
  for (let round = 0; picked.length < maxPairs; round++) {
    let added = false;
    for (const week of weeks) {
      if (round < week.length && picked.length < maxPairs) {
        picked.push(week[round]);
        added = true;
      }
    }
    if (!added) {
      break;
    }
  }
  return picked.sort((a, b) => a - b);
}
