import { requireInvite } from "@/lib/auth";
import { ApiError, toProblem } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { search } from "@/lib/search/service";

import { SearchRequestSchema } from "./schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 항공권 추천 (Server-Sent Events). 이벤트:
 * progress {message} · parsed ParsedSummary · result SearchResponse · error {status, detail}
 * 인증·요청 오류는 스트림을 열기 전에 일반 JSON 오류로 돌려준다.
 */
export async function POST(request: Request) {
  let invite;
  let question: string;
  try {
    invite = await requireInvite(request);
    question = (await readJson(request, SearchRequestSchema)).question;
  } catch (e) {
    return toProblem(e);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 클라이언트가 연결을 끊어도 검색은 끝까지 돌려 사용량을 기록한다
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // 스트림이 이미 닫힘
        }
      };
      try {
        const result = await search(question, invite, {
          progress: (message) => send("progress", { message }),
          parsed: (summary) => send("parsed", summary),
        });
        send("result", result);
      } catch (e) {
        if (e instanceof ApiError) {
          send("error", { status: e.status, detail: e.message });
        } else {
          console.error("검색 실패", e);
          send("error", { status: 500, detail: "검색 중 오류가 발생했습니다." });
        }
      }
      try {
        controller.close();
      } catch {
        // 이미 닫힘
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
