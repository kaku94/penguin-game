"use client";

import { useState } from "react";

import { fetchProfile, type Profile } from "@/lib/client/api";

export function InviteGate({ onSuccess }: { onSuccess: (code: string, profile: Profile) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
          onSuccess(trimmed, await fetchProfile(trimmed));
        } catch (err) {
          setError(err instanceof Error ? err.message : "확인하지 못했습니다.");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <h1>
        적당<span style={{ color: "var(--accent)" }}>항공</span>
      </h1>
      <p>초대받은 사람만 쓸 수 있어요. 받은 초대코드를 입력해주세요.</p>
      <input
        className="field"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="초대코드"
        autoComplete="off"
        autoFocus
      />
      {error && <div className="form-error">{error}</div>}
      <button className="primary" type="submit" disabled={submitting || !code.trim()}>
        {submitting ? "확인 중..." : "시작하기"}
      </button>
    </form>
  );
}
