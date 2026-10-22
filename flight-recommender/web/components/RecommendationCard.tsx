"use client";

import { koWeekday } from "@/lib/search/dates";
import type { FlightLeg, Recommendation } from "@/lib/search/types";

const won = new Intl.NumberFormat("ko-KR");

function date(d: string) {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}(${koWeekday(d)})`;
}

function Leg({ label, leg, from, to }: { label: string; leg: FlightLeg | null; from: string; to: string }) {
  return (
    <div className="leg">
      <span className="card-sub">
        {label} {leg?.flightNo ?? ""}
      </span>
      <b>
        {leg?.depart ?? "--:--"} → {leg?.arrive ?? "--:--"}
      </b>
      <span className="card-sub">
        {from} → {to}
      </span>
    </div>
  );
}

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const estimate = rec.priceBasis !== "exact_date";
  return (
    <div className={`card${rec.rank === 1 ? " top" : ""}`}>
      <div className="card-head">
        <div>
          <div className="card-title">
            {rec.rank === 1 ? "🥇 " : `${rec.rank}. `}
            {rec.city}
          </div>
          <div className="card-sub">
            {date(rec.departDate)} ~ {date(rec.returnDate)}
            {rec.airline ? ` · ${rec.airline}` : ""}
          </div>
        </div>
        <div className="price">
          <strong>{won.format(rec.pricePerPersonKrw)}원</strong>
          <small>1인 왕복{estimate ? " · 추정가" : ""}</small>
        </div>
      </div>

      <div className="legs">
        <Leg label="가는 편" leg={rec.outbound} from={rec.originAirport} to={rec.destinationAirport} />
        <Leg label="오는 편" leg={rec.inbound} from={rec.destinationAirport} to={rec.originAirport} />
      </div>

      <div className="summary-row">
        {rec.stayHours !== null && <span className="chip accent">현지 {Math.round(rec.stayHours)}시간</span>}
        {estimate && <span className="chip warn">기간 추정가</span>}
        {rec.baggageIncluded === false && <span className="chip">위탁수하물 미포함</span>}
        {rec.baggageIncluded === true && <span className="chip">위탁수하물 포함</span>}
      </div>

      <div className="reason">{rec.reason}</div>

      <div className="links">
        {rec.bookingLinks.map((l) => (
          <a key={l.name} href={l.url} target="_blank" rel="noreferrer">
            {l.name} ↗
          </a>
        ))}
      </div>

      {rec.sourceUrls.length > 0 && (
        <details className="sources">
          <summary>가격 출처</summary>
          {rec.sourceUrls.map((u) => (
            <div key={u}>
              <a href={u} target="_blank" rel="noreferrer">
                {u}
              </a>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
