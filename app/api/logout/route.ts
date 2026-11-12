import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { sameOrigin } from "@/lib/claimpilot/session";
import { apiError } from "@/lib/claimpilot/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const response = NextResponse.json({ ok: true });
    response.cookies.delete(SESSION_COOKIE);
    return response;
  } catch (e) {
    return apiError(e);
  }
}
