import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DomainError } from "./engine";
export function apiError(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  if (e instanceof DomainError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(
    "[ClaimPilot]",
    e instanceof Error ? e.name : "Unexpected failure",
  );
  return NextResponse.json(
    {
      error: "The operation failed. Check service configuration and try again.",
    },
    { status: 503 },
  );
}
