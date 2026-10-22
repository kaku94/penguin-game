"""M0 검증: 웹 검색 기반 항공권 가격이 실제 가격과 얼마나 맞는지 측정한다.

사용법:
  python validate.py run    [--limit N] [--model MODEL]   # 추정가 수집 -> results/run_<시각>.csv
  python validate.py score  results/run_<시각>.csv         # actual_price_krw 채운 뒤 정확도 계산

run 이 만든 CSV의 verify_link(구글 항공권)를 열어, 같은 날짜·노선의 최저가 직항 왕복
1인 가격을 actual_price_krw 칸에 적고 score 를 실행한다.
"""

import argparse
import csv
import json
import re
import statistics
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

import anthropic

HERE = Path(__file__).parent
RESULTS_DIR = HERE / "results"

DEFAULT_MODEL = "claude-opus-5-5"
# 토큰 단가 (USD / 1M tokens). 웹 검색 호출 요금은 별도라 횟수만 기록한다.
PRICES = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}
MAX_SEARCHES = 5          # 쿼리당 웹 검색 상한 (PRD §9: 쿼리 전체 8회 이내)
ACCURACY_TOLERANCE = 0.10  # ±10%
ACCURACY_TARGET = 0.80     # 80%
LATENCY_TARGET_S = 60

SYSTEM_PROMPT = """너는 항공권 가격 조사원이다. 웹 검색으로 주어진 노선·날짜의 가격을 찾는다.

조건:
- 성인 1명, 이코노미, 직항 왕복, 주어진 출발일·귀국일 정확히 그 날짜
- 가격은 원화(KRW), 세금·유류할증료 포함, 위탁수하물 미포함 기준 최저가
- 출처에서 실제로 확인한 숫자만 쓴다. 추측한 가격, 편명, 시각을 지어내지 않는다.
- 정확한 날짜의 가격을 못 찾고 "~원부터", "11월 최저가" 같은 범위 가격만 찾았다면
  price_basis 를 "date_range_estimate" 로, 아무것도 못 찾았으면 "not_found" 와 price_krw null 로 둔다.
- 외화 가격만 있으면 환산하고 notes 에 원래 금액과 환율을 적는다.

마지막에 아래 형식의 JSON 을 ```json 코드블록 하나로 출력한다:
{
  "price_krw": 정수 또는 null,
  "price_basis": "exact_date" | "date_range_estimate" | "not_found",
  "airline": 문자열 또는 null,
  "outbound": {"flight_no": 문자열|null, "depart": "HH:MM"|null, "arrive": "HH:MM"|null},
  "inbound":  {"flight_no": 문자열|null, "depart": "HH:MM"|null, "arrive": "HH:MM"|null},
  "baggage_included": true|false|null,
  "source_urls": [가격을 확인한 URL],
  "notes": 짧은 메모
}"""

CSV_FIELDS = [
    "id", "route", "city", "depart", "return",
    "est_price_krw", "price_basis", "airline", "outbound", "inbound",
    "baggage_included", "source_urls", "notes",
    "actual_price_krw", "verify_link",
    "latency_s", "web_searches", "input_tokens", "output_tokens", "est_token_cost_usd",
    "error",
]


def verify_link(q):
    text = f"Flights from {q['origin']} to {q['destination']} on {q['depart']} through {q['return']} nonstop one adult economy"
    return f"https://www.google.com/travel/flights?q={quote(text)}&curr=KRW&hl=ko"


def extract_json(text):
    blocks = re.findall(r"```json\s*(\{.*?\})\s*```", text, re.S)
    if not blocks:
        raise ValueError("응답에 ```json 블록이 없음")
    return json.loads(blocks[-1])


def search_price(client, model, q):
    user_msg = (
        f"{q['origin']} → {q['destination']}({q['city']}) 직항 왕복, "
        f"출발 {q['depart']}, 귀국 {q['return']}, 성인 1명 최저가를 찾아줘."
    )
    messages = [{"role": "user", "content": user_msg}]
    usage = {"input": 0, "output": 0, "searches": 0}
    start = time.monotonic()

    for _ in range(5):  # pause_turn 재개 상한
        response = client.beta.messages.create(
            model=model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=messages,
            tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": MAX_SEARCHES}],
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        usage["input"] += response.usage.input_tokens
        usage["output"] += response.usage.output_tokens
        server_use = getattr(response.usage, "server_tool_use", None)
        if server_use is not None:
            usage["searches"] += server_use.web_search_requests or 0

        if response.stop_reason == "pause_turn":
            messages = [messages[0], {"role": "assistant", "content": response.content}]
            continue
        break

    latency = time.monotonic() - start
    if response.stop_reason == "refusal":
        raise RuntimeError(f"refusal: {response.stop_details}")
    text = "".join(b.text for b in response.content if b.type == "text")
    return extract_json(text), latency, usage


def fmt_leg(leg):
    if not leg:
        return ""
    return " ".join(str(leg.get(k) or "?") for k in ("flight_no", "depart", "arrive"))


def run_one(client, model, q):
    row = {
        "id": q["id"], "route": f"{q['origin']}-{q['destination']}", "city": q["city"],
        "depart": q["depart"], "return": q["return"], "verify_link": verify_link(q),
        "actual_price_krw": "",
    }
    print(f"[{q['id']}] {row['route']} {q['depart']}~{q['return']} 검색 중...", flush=True)
    try:
        data, latency, usage = search_price(client, model, q)
    except Exception as e:  # 한 건 실패가 전체 실행을 멈추지 않게 기록만 한다
        row["error"] = f"{type(e).__name__}: {e}"
        print(f"[{q['id']}] 실패: {row['error']}", flush=True)
        return row

    in_price, out_price = PRICES.get(model, (0, 0))
    row.update({
        "est_price_krw": data.get("price_krw") or "",
        "price_basis": data.get("price_basis", ""),
        "airline": data.get("airline") or "",
        "outbound": fmt_leg(data.get("outbound")),
        "inbound": fmt_leg(data.get("inbound")),
        "baggage_included": data.get("baggage_included"),
        "source_urls": " ".join(data.get("source_urls") or []),
        "notes": data.get("notes") or "",
        "latency_s": round(latency, 1),
        "web_searches": usage["searches"],
        "input_tokens": usage["input"],
        "output_tokens": usage["output"],
        "est_token_cost_usd": round((usage["input"] * in_price + usage["output"] * out_price) / 1e6, 4),
        "error": "",
    })
    print(f"[{q['id']}] {row['est_price_krw'] or '가격 없음'} ({row['price_basis']}), {row['latency_s']}s", flush=True)
    return row


def cmd_run(args):
    queries = json.loads((HERE / "queries.json").read_text(encoding="utf-8"))
    if args.limit:
        queries = queries[: args.limit]

    client = anthropic.Anthropic()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        rows = list(pool.map(lambda q: run_one(client, args.model, q), queries))

    RESULTS_DIR.mkdir(exist_ok=True)
    out = RESULTS_DIR / f"run_{datetime.now():%Y%m%d_%H%M%S}.csv"
    with out.open("w", newline="", encoding="utf-8-sig") as f:  # BOM: 엑셀에서 한글 깨짐 방지
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n저장: {out}")
    print("다음: verify_link 로 실제 가격을 확인해 actual_price_krw 를 채운 뒤")
    print(f"  python validate.py score {out.relative_to(HERE)}")


def to_int(value):
    try:
        return int(float(str(value).replace(",", "")))
    except ValueError:
        return None


def percentile(values, p):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(p * (len(ordered) - 1))))]


def cmd_score(args):
    with open(args.csv, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))

    total = len(rows)
    errors = [r for r in rows if r["error"]]
    found = [r for r in rows if to_int(r["est_price_krw"])]
    checked = [r for r in found if to_int(r["actual_price_krw"])]
    unchecked = [r for r in found if not to_int(r["actual_price_krw"])]

    print(f"총 {total}건 | 오류 {len(errors)} | 가격 찾음 {len(found)} | 실제가 입력됨 {len(checked)}\n")
    if unchecked:
        print(f"주의: 실제가가 비어 있는 {len(unchecked)}건은 정확도 계산에서 빠짐: "
              + ", ".join(r["id"] for r in unchecked) + "\n")

    print(f"{'id':<5}{'노선':<10}{'추정가':>10}{'실제가':>10}{'오차':>8}  근거")
    hits = 0
    by_basis = {}
    for r in checked:
        est, actual = to_int(r["est_price_krw"]), to_int(r["actual_price_krw"])
        err = (est - actual) / actual
        ok = abs(err) <= ACCURACY_TOLERANCE
        hits += ok
        stats = by_basis.setdefault(r["price_basis"] or "?", [0, 0])
        stats[0] += ok
        stats[1] += 1
        print(f"{r['id']:<5}{r['route']:<10}{est:>10,}{actual:>10,}{err:>+8.0%}  {r['price_basis']} {'✓' if ok else '✗'}")

    print()
    if checked:
        accuracy = hits / len(checked)
        verdict = "통과" if accuracy >= ACCURACY_TARGET else "미달 → 데이터 소스 재검토 (PRD §10)"
        print(f"가격 정확도 (±{ACCURACY_TOLERANCE:.0%}): {hits}/{len(checked)} = {accuracy:.0%}  [목표 {ACCURACY_TARGET:.0%}: {verdict}]")
        for basis, (ok, n) in sorted(by_basis.items()):
            print(f"  - {basis}: {ok}/{n}")
    print(f"가격 찾은 비율: {len(found)}/{total} = {len(found) / total:.0%}" if total else "")

    latencies = [float(r["latency_s"]) for r in rows if r["latency_s"]]
    if latencies:
        p90 = percentile(latencies, 0.9)
        print(f"응답 시간: P50 {statistics.median(latencies):.0f}s, P90 {p90:.0f}s "
              f"[목표 {LATENCY_TARGET_S}s: {'통과' if p90 <= LATENCY_TARGET_S else '미달'}]")
    searches = [int(r["web_searches"]) for r in rows if r["web_searches"]]
    costs = [float(r["est_token_cost_usd"]) for r in rows if r["est_token_cost_usd"]]
    if searches:
        print(f"쿼리당 웹 검색: 평균 {statistics.mean(searches):.1f}회")
    if costs:
        print(f"쿼리당 토큰 비용: 평균 ${statistics.mean(costs):.4f} (웹 검색 요금 별도)")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("run", help="웹 검색으로 추정가 수집")
    p_run.add_argument("--limit", type=int, help="앞에서부터 N건만 실행")
    p_run.add_argument("--model", default=DEFAULT_MODEL)
    p_run.add_argument("--workers", type=int, default=4, help="동시 실행 수")
    p_run.set_defaults(func=cmd_run)

    p_score = sub.add_parser("score", help="실제가를 채운 CSV로 정확도 계산")
    p_score.add_argument("csv")
    p_score.set_defaults(func=cmd_score)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
