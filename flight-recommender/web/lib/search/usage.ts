import { config } from "../config";
import type { Invite } from "../auth";
import { ApiError } from "../errors";
import { check, db } from "../supabase";

const SEOUL_OFFSET_MS = 9 * 3_600_000;

function startOfSeoulDay(now: Date): string {
  const local = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SEOUL_OFFSET_MS).toISOString();
}

function startOfSeoulMonth(now: Date): string {
  const local = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - SEOUL_OFFSET_MS).toISOString();
}

/** PRD F10, §9: 초대코드별 일일 한도와 전체 월 예산. */
export async function checkUsage(invite: Invite, now = new Date()): Promise<void> {
  // 진행 중이거나 성공한 검색만 센다. 설정 오류 등으로 실패한 검색은 한도에서 빼준다
  const { count, error } = await db()
    .from("search_logs")
    .select("id", { count: "exact", head: true })
    .eq("invite_code", invite.code)
    .gte("created_at", startOfSeoulDay(now))
    .is("error", null);
  if (error) {
    throw new Error(`Supabase: ${error.message}`);
  }
  if ((count ?? 0) >= invite.daily_limit) {
    throw new ApiError(429, `오늘 검색 한도(${invite.daily_limit}회)를 다 썼습니다. 내일 다시 시도해주세요.`);
  }

  const costs =
    check(
      await db()
        .from("search_logs")
        .select("cost_usd")
        .gte("created_at", startOfSeoulMonth(now))
        .returns<{ cost_usd: number | null }[]>(),
    ) ?? [];
  const spent = (costs ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  if (spent >= config.search.monthlyBudgetUsd) {
    throw new ApiError(503, "이번 달 운영 예산을 다 써서 검색을 잠시 멈췄습니다.");
  }
}

/** 진행 중인 검색도 일일 한도에 잡히도록 시작할 때 먼저 기록한다. */
export async function startSearchLog(inviteCode: string, question: string): Promise<number> {
  const row = check(
    await db()
      .from("search_logs")
      .insert({ invite_code: inviteCode, question: question.slice(0, 500) })
      .select("id")
      .single<{ id: number }>(),
  );
  // single()은 행이 없으면 error를 돌려주므로 여기선 항상 있다
  return row!.id;
}

export async function finishSearchLog(
  id: number,
  values: {
    latency_ms: number;
    input_tokens: number;
    output_tokens: number;
    web_searches: number;
    cost_usd: number;
    result_count: number;
    error: string | null;
  },
): Promise<void> {
  const { error } = await db().from("search_logs").update(values).eq("id", id);
  if (error) {
    console.error("검색 기록 저장 실패", error.message);
  }
}
