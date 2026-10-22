import { z } from "zod";

import type { CarrierPreference } from "./search/types";
import { check, db } from "./supabase";

export const DEFAULT_HOME_AIRPORTS = ["ICN", "GMP"];

export type Profile = { homeAirports: string[]; carrierPreference: CarrierPreference };

export const ProfileRequestSchema = z.object({
  homeAirports: z
    .array(z.string().regex(/^[A-Za-z]{3}$/, "IATA 3글자 코드여야 합니다"))
    .min(1, "출발 공항을 하나 이상 넣어주세요")
    .transform((list) => list.map((a) => a.toUpperCase())),
  carrierPreference: z.enum(["ANY", "LCC", "FSC"]),
});

type Row = { home_airports: string[]; carrier_preference: CarrierPreference };

/** 저장한 적이 없으면 기본값(ICN, GMP / 항공사 무관) */
export async function getProfile(inviteCode: string): Promise<Profile> {
  const row = check(
    await db()
      .from("user_profiles")
      .select("home_airports, carrier_preference")
      .eq("invite_code", inviteCode)
      .maybeSingle<Row>(),
  );
  return row
    ? { homeAirports: row.home_airports, carrierPreference: row.carrier_preference }
    : { homeAirports: DEFAULT_HOME_AIRPORTS, carrierPreference: "ANY" };
}

export async function saveProfile(inviteCode: string, profile: Profile): Promise<Profile> {
  check(
    await db().from("user_profiles").upsert({
      invite_code: inviteCode,
      home_airports: profile.homeAirports,
      carrier_preference: profile.carrierPreference,
      updated_at: new Date().toISOString(),
    }),
  );
  return profile;
}
