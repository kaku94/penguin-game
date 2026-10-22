import { requireInvite } from "@/lib/auth";
import { toProblem } from "@/lib/errors";
import { readJson } from "@/lib/http";
import { ProfileRequestSchema, getProfile, saveProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const invite = await requireInvite(request);
    return Response.json(await getProfile(invite.code));
  } catch (e) {
    return toProblem(e);
  }
}

export async function PUT(request: Request) {
  try {
    const invite = await requireInvite(request);
    const body = await readJson(request, ProfileRequestSchema);
    return Response.json(await saveProfile(invite.code, body));
  } catch (e) {
    return toProblem(e);
  }
}
