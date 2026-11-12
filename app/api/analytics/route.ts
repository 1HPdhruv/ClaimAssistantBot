import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/claimpilot/session";
import { readState } from "@/lib/claimpilot/store";
import { analytics } from "@/lib/claimpilot/analytics";
import { apiError } from "@/lib/claimpilot/http";
export async function GET(req: Request) {
  try {
    const a = await getActor();
    const url = new URL(req.url);
    const from = z.iso
      .date()
      .parse(url.searchParams.get("from") || "2026-01-01");
    const to = z.iso.date().parse(url.searchParams.get("to") || "2026-12-31");
    return NextResponse.json(analytics(await readState(), a, from, to));
  } catch (e) {
    return apiError(e);
  }
}
