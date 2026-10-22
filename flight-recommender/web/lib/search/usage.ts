import { config } from "../config";
import type { Invite } from "../auth";
import { db } from "../db";
import { ApiError } from "../errors";

const SEOUL_OFFSET_MS = 9 * 3_600_000;

function startOfSeoulDay(now: Date): Date {
  const local = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SEOUL_OFFSET_MS);
}

function startOfSeoulMonth(now: Date): Date {
  const local = new Date(now.getTime() + SEOUL_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - SEOUL_OFFSET_MS);
}

/** PRD F10, §9: 초대코드별 일일 한도와 전체 월 예산. */
export async function checkUsage(invite: Invite, now = new Date()): Promise<void> {
  const sql = await db();
  // 진행 중이거나 성공한 검색만 센다. 설정 오류 등으로 실패한 검색은 한도에서 빼준다
  const [{ count }] = await sql<{ count: number }[]>`
    select count(*)::int as count from search_logs
    where invite_code = ${invite.code} and created_at >= ${startOfSeoulDay(now)} and error is null`;
  if (count >= invite.daily_limit) {
    throw new ApiError(429, `오늘 검색 한도(${invite.daily_limit}회)를 다 썼습니다. 내일 다시 시도해주세요.`);
  }

  const [{ spent }] = await sql<{ spent: number }[]>`
    select coalesce(sum(cost_usd), 0)::float8 as spent from search_logs where created_at >= ${startOfSeoulMonth(now)}`;
  if (spent >= config.search.monthlyBudgetUsd) {
    throw new ApiError(503, "이번 달 운영 예산을 다 써서 검색을 잠시 멈췄습니다.");
  }
}

/** 진행 중인 검색도 일일 한도에 잡히도록 시작할 때 먼저 기록한다. */
export async function startSearchLog(inviteCode: string, question: string): Promise<number> {
  const sql = await db();
  const [row] = await sql<{ id: number }[]>`
    insert into search_logs (invite_code, question) values (${inviteCode}, ${question.slice(0, 500)})
    returning id::int as id`;
  return row.id;
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
  try {
    const sql = await db();
    await sql`update search_logs set ${sql(values)} where id = ${id}`;
  } catch (e) {
    console.error("검색 기록 저장 실패", e);
  }
}
