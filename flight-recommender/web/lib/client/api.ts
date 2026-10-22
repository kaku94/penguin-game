import type { ParsedSummary, SearchResponse } from "../search/types";

export type Profile = { homeAirports: string[]; carrierPreference: "ANY" | "LCC" | "FSC" };

export class ClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const headers = (code: string) => ({ "content-type": "application/json", "x-invite-code": code });

async function failure(res: Response): Promise<ClientError> {
  const body = await res.json().catch(() => null);
  return new ClientError(res.status, body?.detail ?? `요청 실패 (${res.status})`);
}

export async function fetchProfile(code: string): Promise<Profile> {
  const res = await fetch("/api/profile", { headers: headers(code) });
  if (!res.ok) throw await failure(res);
  return res.json();
}

export async function saveProfile(code: string, profile: Profile): Promise<Profile> {
  const res = await fetch("/api/profile", { method: "PUT", headers: headers(code), body: JSON.stringify(profile) });
  if (!res.ok) throw await failure(res);
  return res.json();
}

export type SearchEvents = {
  progress: (message: string) => void;
  parsed: (summary: ParsedSummary) => void;
  result: (response: SearchResponse) => void;
};

/** POST /api/search 의 SSE 스트림을 읽는다. EventSource는 헤더·POST를 못 써서 fetch로 직접 파싱한다. */
export async function streamSearch(code: string, question: string, on: SearchEvents, signal?: AbortSignal) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: headers(code),
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) continue;
      const payload = JSON.parse(data.join("\n"));
      if (event === "progress") on.progress(payload.message);
      else if (event === "parsed") on.parsed(payload);
      else if (event === "result") on.result(payload);
      else if (event === "error") throw new ClientError(payload.status, payload.detail);
    }
  }
}
