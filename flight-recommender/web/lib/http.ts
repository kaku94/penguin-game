import type { z } from "zod";

import { ApiError } from "./errors";

/** JSON 본문을 읽고 zod 스키마로 검증한다. 실패하면 400. */
export async function readJson<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "요청 본문을 읽을 수 없습니다. UTF-8 JSON인지 확인해주세요.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ApiError(400, `${issue.path.join(".") || "body"}: ${issue.message}`);
  }
  return parsed.data;
}
