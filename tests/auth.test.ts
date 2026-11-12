import test from "node:test";
import assert from "node:assert/strict";
import { createSession, sessionIdentity } from "../lib/auth";
import { uid } from "../lib/claimpilot/seed";
test("signed expiring sessions reject forged roles and tampering", async () => {
  process.env.APP_SESSION_SECRET = "isolated-test-secret";
  const token = await createSession(uid(1));
  assert.equal(await sessionIdentity(token), uid(1));
  assert.equal(await sessionIdentity(token.replace(uid(1), uid(8))), null);
  assert.equal(await sessionIdentity(`${uid(1)}.0.fake`), null);
  assert.equal(await sessionIdentity(undefined), null);
  assert.equal(await sessionIdentity(token + "tampered"), null);
});
