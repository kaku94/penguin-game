import postgres from "postgres";

import { ApiError } from "./errors";
import { SCHEMA_SQL, parseInviteCodes } from "./schema";

let client: postgres.Sql | undefined;
let ready: Promise<void> | undefined;

/**
 * Supabase Postgres 직접 연결. Vercel의 Supabase 연동이 넣어주는 POSTGRES_URL(트랜잭션 풀러)을 쓴다.
 * 처음 호출될 때 스키마를 맞추고 INVITE_CODES의 초대코드를 등록한다.
 */
export async function db(): Promise<postgres.Sql> {
  if (!client) {
    const raw = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
    if (!raw) {
      throw new ApiError(503, "DB 환경변수(POSTGRES_URL)가 설정되지 않았습니다.");
    }
    // Supabase가 붙이는 비표준 쿼리 파라미터(supa 등)는 서버 설정값으로 전달돼 오류가 나므로 뗀다
    const url = new URL(raw);
    url.search = "";
    client = postgres(url.toString(), {
      ssl: "require",
      // 트랜잭션 풀러는 prepared statement를 지원하지 않는다
      prepare: false,
      max: 3,
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  const sql = client;
  ready ??= migrate(sql).catch((e) => {
    ready = undefined; // 다음 요청에서 다시 시도
    throw e;
  });
  await ready;
  return sql;
}

async function migrate(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(SCHEMA_SQL);
  for (const invite of parseInviteCodes(process.env.INVITE_CODES)) {
    await sql`
      insert into invite_codes (code, name, daily_limit)
      values (${invite.code}, ${invite.name}, ${invite.dailyLimit})
      on conflict (code) do update set name = excluded.name, daily_limit = excluded.daily_limit, active = true`;
  }
}
