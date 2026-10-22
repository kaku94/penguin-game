"use client";

import { koWeekday } from "@/lib/search/dates";
import type { Suggestion } from "@/lib/search/types";

function date(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${koWeekday(d)})`;
}

/** 무료 모드 추천 카드: 가격 없이 도시·날짜와 예약 링크 */
export function SuggestionCard({ suggestion: s, top }: { suggestion: Suggestion; top: boolean }) {
  return (
    <div className={`card${top ? " top" : ""}`}>
      <div className="card-head">
        <div>
          <div className="card-title">{s.city}</div>
          <div className="card-sub">
            {date(s.departDate)} ~ {date(s.returnDate)} · {s.originAirport} → {s.destinationAirport}
          </div>
        </div>
        <div className="price">
          <small>가격은 링크에서 확인</small>
        </div>
      </div>
      <div className="reason">{s.reason}</div>
      <div className="links">
        {s.bookingLinks.map((l) => (
          <a key={l.name} href={l.url} target="_blank" rel="noreferrer">
            {l.name} ↗
          </a>
        ))}
      </div>
    </div>
  );
}
