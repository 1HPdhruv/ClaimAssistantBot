import { NextResponse } from "next/server";
import { agentRequestSchema } from "@/lib/schemas";
import { runAgent } from "@/lib/agent/runAgent";
import { getActor, sameOrigin } from "@/lib/claimpilot/session";
import { apiError } from "@/lib/claimpilot/http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const actor = await getActor();
    const d = agentRequestSchema.parse(await req.json());
    if (!process.env.GEMINI_API_KEY)
      return NextResponse.json(
        {
          error:
            "Gemini is not configured. The expense, investigation and approval workspaces remain available.",
        },
        { status: 503 },
      );
    return NextResponse.json(await runAgent(d.messages, actor));
  } catch (e) {
    return apiError(e);
  }
}
