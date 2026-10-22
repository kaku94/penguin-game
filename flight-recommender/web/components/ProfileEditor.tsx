"use client";

import { useState } from "react";

import { saveProfile, type Profile } from "@/lib/client/api";

const CARRIERS: { value: Profile["carrierPreference"]; label: string }[] = [
  { value: "ANY", label: "상관없음" },
  { value: "LCC", label: "저비용" },
  { value: "FSC", label: "대형 항공사" },
];

export function ProfileEditor({
  code,
  profile,
  onSaved,
  onCancel,
}: {
  code: string;
  profile: Profile;
  onSaved: (p: Profile) => void;
  onCancel: () => void;
}) {
  const [airports, setAirports] = useState(profile.homeAirports.join(", "));
  const [carrier, setCarrier] = useState(profile.carrierPreference);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="profile-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        try {
          const homeAirports = airports
            .split(/[\s,]+/)
            .map((a) => a.trim())
            .filter(Boolean);
          onSaved(await saveProfile(code, { homeAirports, carrierPreference: carrier }));
        } catch (err) {
          setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
        } finally {
          setSaving(false);
        }
      }}
    >
      <label>
        출발 공항 (IATA 코드, 쉼표로 구분)
        <input className="field" value={airports} onChange={(e) => setAirports(e.target.value)} placeholder="ICN, GMP" />
      </label>
      <label>
        선호 항공사
        <div className="segmented">
          {CARRIERS.map((c) => (
            <button key={c.value} type="button" aria-pressed={carrier === c.value} onClick={() => setCarrier(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
      </label>
      {error && <div className="form-error">{error}</div>}
      <div className="row">
        <button type="button" className="secondary" onClick={onCancel}>
          취소
        </button>
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
