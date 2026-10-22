import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "./errors";

let client: SupabaseClient | undefined;

/** 서버 전용 클라이언트. 테이블은 RLS로 막혀 있어 service role 키로만 접근한다. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) {
      throw new ApiError(503, "Supabase 환경변수(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

/** supabase-js 오류를 예외로 바꾼다 */
export function check<T>(result: { data: T | null; error: { message: string } | null }): T | null {
  if (result.error) {
    throw new Error(`Supabase: ${result.error.message}`);
  }
  return result.data;
}
