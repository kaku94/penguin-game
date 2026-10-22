"use client";

import { useEffect, useState } from "react";

import { createFirstInvite, fetchProfile, needsSetup, type Profile } from "@/lib/client/api";

/** 초대코드 입력. 초대코드가 아직 하나도 없으면 첫 코드를 정하는 화면을 보여준다. */
export function InviteGate({ onSuccess }: { onSuccess: (code: string, profile: Profile) => void }) {
  const [setup, setSetup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    needsSetup().then(setSetup);
  }, []);

  return (
    <form
      className="gate"
      onSubmit={async (e) => {
        e.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) return;
        setSubmitting(true);
        setError(null);
        try {
          if (setup) {
            await createFirstInvite(trimmed, "관리자");
          }
          onSuccess(trimmed, await fetchProfile(trimmed));
        } catch (err) {
          setError(err instanceof Error ? err.message : "확인하지 못했습니다.");
          needsSetup().then(setSetup);
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <h1>
        적당<span style={{ color: "var(--accent)" }}>항공</span>
      </h1>
      {setup ? (
        <p>
          처음 오셨네요! 앞으로 들어올 때 쓸 <b>초대코드</b>를 정해주세요. 6자 이상, 다른 사람이 짐작하기 어렵게요.
          지인에게 이 코드를 알려주면 같이 쓸 수 있어요.
        </p>
      ) : (
        <p>초대받은 사람만 쓸 수 있어요. 받은 초대코드를 입력해주세요.</p>
      )}
      <input
        className="field"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={setup ? "새 초대코드 (6자 이상)" : "초대코드"}
        autoComplete="off"
        autoFocus
      />
      {error && <div className="form-error">{error}</div>}
      <button className="primary" type="submit" disabled={submitting || !code.trim()}>
        {submitting ? "확인 중..." : setup ? "이 코드로 시작하기" : "시작하기"}
      </button>
    </form>
  );
}
