import { describe, expect, it } from "vitest";

import { parseInviteCodes } from "./schema";

describe("parseInviteCodes", () => {
  it("코드:이름:한도 형식을 읽고 빠진 값은 기본값으로", () => {
    expect(parseInviteCodes(" abc:나:30 , def , ghi:친구 ,, ")).toEqual([
      { code: "abc", name: "나", dailyLimit: 30 },
      { code: "def", name: "def", dailyLimit: 20 },
      { code: "ghi", name: "친구", dailyLimit: 20 },
    ]);
  });

  it("비어 있으면 빈 목록", () => {
    expect(parseInviteCodes(undefined)).toEqual([]);
    expect(parseInviteCodes("")).toEqual([]);
  });
});
