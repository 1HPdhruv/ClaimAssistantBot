import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor, sameOrigin } from "@/lib/claimpilot/session";
import { mutate } from "@/lib/claimpilot/store";
import { confirmProposal } from "@/lib/agent/tools";
import { apiError } from "@/lib/claimpilot/http";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const a = await getActor();
    const { proposalId } = z
      .object({ proposalId: z.string().uuid() })
      .strict()
      .parse(await req.json());
    return NextResponse.json(
      await mutate((s) => confirmProposal(s, a, proposalId)),
    );
  } catch (e) {
    return apiError(e);
  }
}
