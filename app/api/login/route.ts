import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSession } from "@/lib/auth";
import { readState } from "@/lib/claimpilot/store";
import { sameOrigin } from "@/lib/claimpilot/session";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const d = z
      .object({
        passcode: z.string().max(100).default(""),
        identity: z.enum(["employee", "manager", "finance"]),
      })
      .strict()
      .parse(await req.json());
    const expected = process.env.APP_PASSCODE?.trim();
    if (expected && d.passcode !== expected)
      return NextResponse.json({ error: "Wrong passcode" }, { status: 401 });
    if (process.env.NODE_ENV === "production" && !expected)
      return NextResponse.json(
        { error: "APP_PASSCODE must be configured for hosted demos" },
        { status: 503 },
      );
    const actor = (await readState()).profiles.find(
      (p) => p.role === d.identity,
    );
    if (!actor) throw new Error("Demo identity missing");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSession(actor.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 43200,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Unable to sign in. Check server configuration." },
      { status: 400 },
    );
  }
}
