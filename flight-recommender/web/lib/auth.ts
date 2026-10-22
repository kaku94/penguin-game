import { ApiError } from "./errors";
import { check, db } from "./supabase";

export const INVITE_HEADER = "x-invite-code";

export type Invite = { code: string; name: string; daily_limit: number };

/** PRD F10: 유효한 초대코드가 있어야 API를 쓸 수 있다. */
export async function requireInvite(request: Request): Promise<Invite> {
  const code = request.headers.get(INVITE_HEADER)?.trim();
  if (code) {
    const invite = check(
      await db()
        .from("invite_codes")
        .select("code, name, daily_limit")
        .eq("code", code)
        .eq("active", true)
        .maybeSingle<Invite>(),
    );
    if (invite) {
      return invite;
    }
  }
  throw new ApiError(401, "유효한 초대코드를 X-Invite-Code 헤더로 보내주세요.");
}
