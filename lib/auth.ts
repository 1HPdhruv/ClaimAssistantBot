export const SESSION_COOKIE = "claimpilot_session";
export const isDemo = () => process.env.CLAIMPILOT_STORAGE !== "supabase";
function secret() {
  const s =
    process.env.APP_SESSION_SECRET?.trim() || process.env.APP_PASSCODE?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production")
    throw new Error("Set APP_SESSION_SECRET for production demo sessions");
  return "claimpilot-local-development-only";
}
async function sign(s: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(s)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function createSession(id: string) {
  const payload = `${id}.${Date.now() + 12 * 3600000}`;
  return `${payload}.${await sign(payload)}`;
}
export async function sessionIdentity(value: string | undefined) {
  if (!value) return null;
  const [id, expires, sig] = value.split(".");
  if (!id || !expires || !sig || Number(expires) < Date.now()) return null;
  const expected = await sign(`${id}.${expires}`);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++)
    diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? id : null;
}
export async function isValidSession(v: string | undefined) {
  return !!(await sessionIdentity(v));
}
