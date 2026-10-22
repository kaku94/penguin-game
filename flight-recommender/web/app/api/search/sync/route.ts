import { requireInvite } from "@/lib/auth";
import { toProblem } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { search } from "@/lib/search/service";

import { SearchRequestSchema } from "../schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 스트리밍 없이 최종 결과만. Swagger에서 테스트할 때 편하다. */
export async function POST(request: Request) {
  try {
    const invite = await requireInvite(request);
    const { question } = await readJson(request, SearchRequestSchema);
    return Response.json(await search(question, invite));
  } catch (e) {
    return toProblem(e);
  }
}
