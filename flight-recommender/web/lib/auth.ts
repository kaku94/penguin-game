import { db } from "./db";
import { ApiError } from "./errors";

export const INVITE_HEADER = "x-invite-code";

export type Invite = { code: string; name: string; daily_limit: number };

/** PRD F10: 유효한 초대코드가 있어야 API를 쓸 수 있다. */
export async function requireInvite(request: Request): Promise<Invite> {
  const code = request.headers.get(INVITE_HEADER)?.trim();
  if (code) {
    const sql = await db();
    const [invite] = await sql<Invite[]>`
      select code, name, daily_limit from invite_codes where code = ${code} and active`;
    if (invite) {
      return invite;
    }
  }
  throw new ApiError(401, "유효한 초대코드를 X-Invite-Code 헤더로 보내주세요.");
}
