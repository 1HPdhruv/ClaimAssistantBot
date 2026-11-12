import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionIdentity } from "../auth";
import { readState } from "./store";
import { DomainError } from "./engine";
export async function getActor() {
  const id = await sessionIdentity(
    (await cookies()).get(SESSION_COOKIE)?.value,
  );
  if (!id) throw new DomainError("Sign in to continue", 401);
  const actor = (await readState()).profiles.find((p) => p.id === id);
  if (!actor) throw new DomainError("Session identity not found", 401);
  return actor;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin)
    throw new DomainError("Cross-origin request rejected", 403);
}
