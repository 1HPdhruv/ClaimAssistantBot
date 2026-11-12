import { NextResponse } from "next/server";
import { getActor } from "@/lib/claimpilot/session";
import { readState, remote } from "@/lib/claimpilot/store";
import { viewState } from "@/lib/claimpilot/service";
import { apiError } from "@/lib/claimpilot/http";
export async function GET() {
  try {
    const actor = await getActor();
    return NextResponse.json({
      actor,
      mode: remote() ? "Supabase demo" : "Local demo",
      aiConfigured: !!process.env.GEMINI_API_KEY,
      ...viewState(await readState(), actor),
    });
  } catch (e) {
    return apiError(e);
  }
}
