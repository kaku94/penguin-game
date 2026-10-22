import { z } from "zod";

import { db } from "@/lib/db";
import { ApiError, toProblem } from "@/lib/errors";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const SetupSchema = z.object({
  code: z.string().trim().min(6, "초대코드는 6자 이상으로 정해주세요").max(64),
  name: z.string().trim().min(1).max(30).default("관리자"),
});

/** 초대코드가 하나도 없으면 첫 방문자가 첫 코드를 만들 수 있다. */
export async function GET() {
  try {
    const sql = await db();
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from invite_codes`;
    return Response.json({ needsSetup: count === 0 });
  } catch (e) {
    return toProblem(e);
  }
}

/** 최초 설정: 초대코드가 하나도 없을 때만 성공한다. 이후에는 409. */
export async function POST(request: Request) {
  try {
    const { code, name } = await readJson(request, SetupSchema);
    const sql = await db();
    const created = await sql`
      insert into invite_codes (code, name, daily_limit)
      select ${code}, ${name}, 20
      where not exists (select 1 from invite_codes)
      returning code`;
    if (created.length === 0) {
      throw new ApiError(409, "이미 초대코드가 설정되어 있습니다. 받은 초대코드로 들어와주세요.");
    }
    return Response.json({ ok: true }, { status: 201 });
  } catch (e) {
    return toProblem(e);
  }
}
