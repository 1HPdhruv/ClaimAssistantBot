import { NextResponse } from "next/server";
import { getActor, sameOrigin } from "@/lib/claimpilot/session";
import { mutate, readState } from "@/lib/claimpilot/store";
import {
  createExpense,
  createTrip,
  createClaim,
  viewState,
} from "@/lib/claimpilot/service";
import { apiError } from "@/lib/claimpilot/http";
import { DomainError } from "@/lib/claimpilot/engine";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    const a = await getActor();
    const { resource } = await params;
    const v = viewState(await readState(), a);
    if (
      ![
        "expenses",
        "trips",
        "claims",
        "policies",
        "receipts",
        "audits",
        "reimbursements",
        "evaluations",
      ].includes(resource)
    )
      throw new DomainError("Resource not found", 404);
    return NextResponse.json(v[resource as keyof typeof v]);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(
  req: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    sameOrigin(req);
    const a = await getActor();
    const { resource } = await params;
    const input = await req.json();
    const fn =
      resource === "expenses"
        ? createExpense
        : resource === "trips"
          ? createTrip
          : resource === "claims"
            ? createClaim
            : null;
    if (!fn) throw new DomainError("Resource not found", 404);
    return NextResponse.json(await mutate((s) => fn(s, a, input)), {
      status: 201,
    });
  } catch (e) {
    return apiError(e);
  }
}
