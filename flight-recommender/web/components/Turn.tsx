"use client";

import { koWeekday } from "@/lib/search/dates";

import type { TurnState } from "./App";
import { RecommendationCard } from "./RecommendationCard";

const SOURCE_LABEL = { TABLE: "추천 목록", LLM: "AI 추천", USER: "지정" } as const;

export function Turn({ turn }: { turn: TurnState }) {
  const { parsed, result } = turn;
  return (
    <article className="answer">
      <div className="bubble-user">{turn.question}</div>

      {!turn.done && (
        <div className="progress">
          {turn.progress.map((p, i) => (
            <div key={i} className={i === turn.progress.length - 1 ? "current" : undefined}>
              {p}
            </div>
          ))}
          {turn.progress.length === 0 && <div className="current">요청을 보내는 중</div>}
        </div>
      )}

      {parsed && (
        <div className="panel">
          <h3>이렇게 이해했어요</h3>
          <div className="summary-row">
            {parsed.purpose && <span className="chip accent">{parsed.purpose}</span>}
            <span className="chip">
              {parsed.dateFrom} ~ {parsed.dateTo}
            </span>
            <span className="chip">{parsed.nights === 0 ? "당일치기" : `${parsed.nights}박${parsed.nights + 1}일`}</span>
            {parsed.weekdaysOnly && <span className="chip">평일만</span>}
            <span className="chip">{parsed.passengers}명</span>
            <span className="chip">{parsed.origins.join("·")} 출발</span>
          </div>
          <div className="summary-row" style={{ marginTop: 6 }}>
            {parsed.destinations.map((d) => (
              <span key={d.city} className="chip" title={d.reason}>
                {d.city} ({d.airports.join("/")}) · {SOURCE_LABEL[d.source]}
              </span>
            ))}
          </div>
          {parsed.datePairs.length > 0 && (
            <div className="card-sub" style={{ marginTop: 6 }}>
              확인할 날짜:{" "}
              {parsed.datePairs
                .map((p) => p.split("~")[0])
                .map((d) => `${d.slice(5)}(${koWeekday(d)})`)
                .join(", ")}
            </div>
          )}
          {parsed.assumptions.length > 0 && (
            <ul className="assumptions">
              {parsed.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result && (
        <>
          {result.recommendations.map((r) => (
            <RecommendationCard key={`${r.city}-${r.departDate}`} rec={r} />
          ))}
          <ul className="notice">
            {result.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="stats">
            {(result.stats.latencyMs / 1000).toFixed(0)}초 · 웹 검색 {result.stats.webSearches}회 · 약 $
            {result.stats.estimatedCostUsd.toFixed(3)}
          </div>
        </>
      )}

      {turn.error && <div className="error">{turn.error}</div>}
    </article>
  );
}
