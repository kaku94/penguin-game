import { z } from "zod";

import { db } from "./db";
import type { CarrierPreference } from "./search/types";

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
  const sql = await db();
  const [row] = await sql<Row[]>`
    select home_airports, carrier_preference from user_profiles where invite_code = ${inviteCode}`;
  return row
    ? { homeAirports: row.home_airports, carrierPreference: row.carrier_preference }
    : { homeAirports: DEFAULT_HOME_AIRPORTS, carrierPreference: "ANY" };
}

export async function saveProfile(inviteCode: string, profile: Profile): Promise<Profile> {
  const sql = await db();
  await sql`
    insert into user_profiles (invite_code, home_airports, carrier_preference, updated_at)
    values (${inviteCode}, ${profile.homeAirports}, ${profile.carrierPreference}, now())
    on conflict (invite_code) do update
      set home_airports = excluded.home_airports,
          carrier_preference = excluded.carrier_preference,
          updated_at = now()`;
  return profile;
}
