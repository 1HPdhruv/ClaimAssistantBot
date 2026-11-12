import { NextResponse } from "next/server";
import { getActor, sameOrigin } from "@/lib/claimpilot/session";
import { mutate } from "@/lib/claimpilot/store";
import {
  updateExpense,
  deleteExpense,
  transitionClaim,
  updatePolicy,
  addComment,
} from "@/lib/claimpilot/service";
import { apiError } from "@/lib/claimpilot/http";
import { DomainError } from "@/lib/claimpilot/engine";
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
) {
  try {
    sameOrigin(req);
    const a = await getActor();
    const { resource, id } = await params;
    const data = await req.json();
    const fn =
      resource === "expenses"
        ? updateExpense
        : resource === "claims"
          ? transitionClaim
          : resource === "policies"
            ? updatePolicy
            : resource === "comments"
              ? addComment
              : null;
    if (!fn) throw new DomainError("Resource not found", 404);
    return NextResponse.json(await mutate((s) => fn(s, a, id, data)));
  } catch (e) {
    return apiError(e);
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ resource: string; id: string }> },
) {
  try {
    sameOrigin(req);
    const a = await getActor();
    const { resource, id } = await params;
    if (resource !== "expenses")
      throw new DomainError("Only draft expenses can be deleted", 405);
    return NextResponse.json(await mutate((s) => deleteExpense(s, a, id)));
  } catch (e) {
    return apiError(e);
  }
}
