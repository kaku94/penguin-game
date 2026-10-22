"use client";

import { useEffect, useRef, useState } from "react";

import { ClientError, fetchProfile, streamSearch, type Profile } from "@/lib/client/api";
import type { ParsedSummary, SearchResponse } from "@/lib/search/types";

import { InviteGate } from "./InviteGate";
import { ProfileEditor } from "./ProfileEditor";
import { Turn } from "./Turn";

const STORAGE_KEY = "flight-recommender.invite-code";

const EXAMPLES = [
  "맛집투어하러 1박2일 평일에 일본 여행갈려는데 11월중에 싼 항공권 있나?",
  "12월 첫째 주에 후쿠오카 2박3일, 금요일 출발은 빼고",
  "온천 가고 싶은데 다음 달 평일 1박2일 20만원 이하로",
];

export type TurnState = {
  id: number;
  question: string;
  progress: string[];
  parsed?: ParsedSummary;
  result?: SearchResponse;
  error?: string;
  done: boolean;
};

function readStoredCode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeCode(code: string | null) {
  try {
    if (code) localStorage.setItem(STORAGE_KEY, code);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰면 이번 세션에서만 유지
  }
}

export function App() {
  const [code, setCode] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checking, setChecking] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [turns, setTurns] = useState<TurnState[]>([]);
  const [input, setInput] = useState("");
  const busy = turns.some((t) => !t.done);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 저장된 초대코드가 아직 유효한지 확인
  useEffect(() => {
    const stored = readStoredCode();
    if (!stored) {
      setChecking(false);
      return;
    }
    fetchProfile(stored)
      .then((p) => {
        setCode(stored);
        setProfile(p);
      })
      .catch(() => storeCode(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  if (checking) {
    return <main className="shell" />;
  }

  if (!code || !profile) {
    return (
      <main className="shell">
        <InviteGate
          onSuccess={(newCode, p) => {
            storeCode(newCode);
            setCode(newCode);
            setProfile(p);
          }}
        />
      </main>
    );
  }

  const update = (id: number, patch: (t: TurnState) => Partial<TurnState>) =>
    setTurns((all) => all.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)));

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || busy || !code) return;
    const id = Date.now();
    setTurns((all) => [...all, { id, question: trimmed, progress: [], done: false }]);
    setInput("");
    try {
      await streamSearch(code, trimmed, {
        progress: (message) => update(id, (t) => ({ progress: [...t.progress, message] })),
        parsed: (parsed) => update(id, () => ({ parsed })),
        result: (result) => update(id, () => ({ result })),
      });
      update(id, () => ({ done: true }));
    } catch (e) {
      if (e instanceof ClientError && e.status === 401) {
        storeCode(null);
        setCode(null);
      }
      update(id, () => ({ done: true, error: e instanceof Error ? e.message : "검색에 실패했습니다." }));
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          적당<span>항공</span>
        </div>
        <div className="topbar-actions">
          <button className="chip" onClick={() => setEditingProfile((v) => !v)} title="출발 공항 설정">
            ✈ {profile.homeAirports.join(" · ")} 출발
          </button>
          <button
            className="link-button"
            onClick={() => {
              storeCode(null);
              setCode(null);
              setTurns([]);
            }}
          >
            나가기
          </button>
        </div>
      </header>

      {editingProfile && (
        <div className="panel" style={{ marginTop: 12 }}>
          <ProfileEditor
            code={code}
            profile={profile}
            onSaved={(p) => {
              setProfile(p);
              setEditingProfile(false);
            }}
            onCancel={() => setEditingProfile(false)}
          />
        </div>
      )}

      <section className="thread" aria-live="polite">
        {turns.length === 0 ? (
          <div className="empty">
            <h1>어디로, 언제쯤 떠나고 싶으세요?</h1>
            <div>목적·기간·예산을 편하게 말하면 적당한 항공권을 찾아드려요.</div>
            <div className="examples">
              {EXAMPLES.map((q) => (
                <button key={q} className="example" onClick={() => ask(q)}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((t) => <Turn key={t.id} turn={t} />)
        )}
        <div ref={bottomRef} />
      </section>

      <div className="composer">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <textarea
            rows={1}
            value={input}
            maxLength={500}
            placeholder="예: 11월 평일에 오사카 1박2일 싼 항공권"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                ask(input);
              }
            }}
          />
          <button className="primary" type="submit" disabled={busy || !input.trim()}>
            {busy ? "찾는 중" : "찾기"}
          </button>
        </form>
      </div>
    </main>
  );
}
