import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getTools, confirmProposal } from "../lib/agent/tools";
import { mutate, readState } from "../lib/claimpilot/store";
import { seedState } from "../lib/claimpilot/seed";
import { createClaim, createExpense } from "../lib/claimpilot/service";
import { detectMime, extractionSchema } from "../lib/claimpilot/receipts";
test("Gemini tools enforce actor identity, role scopes, validation and single-use human confirmation", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "claimpilot-tools-"));
  process.env.CLAIMPILOT_DATA_DIR = dir;
  process.env.CLAIMPILOT_STORAGE = "local";
  try {
    const s = seedState();
    const employee = s.profiles[0],
      manager = s.profiles[5];
    const tools = getTools(employee),
      managerTools = getTools(manager);
    assert(!tools.some((t) => t.name === "approveClaim"));
    assert(!tools.some((t) => t.name === "getFinanceAnalytics"));
    assert(managerTools.some((t) => t.name === "approveClaim"));
    const create = tools.find((t) => t.name === "createExpense")!;
    await assert.rejects(
      async () =>
        create.run({ merchant: "Injection", employeeId: s.profiles[7].id }),
      /Unrecognized key|Invalid input/,
    );
    const c = await mutate((state) => {
      const e = createExpense(state, employee, {
        merchant: "Tool cafe",
        category: "Meals",
        amount: "100",
        currency: "INR",
        date: "2026-11-12",
        purpose: "Business lunch",
      });
      return createClaim(state, employee, {
        title: "Tool confirmation test",
        expenseIds: [e.id],
      });
    });
    const proposal = (await tools
      .find((t) => t.name === "submitClaim")!
      .run({ id: c.id })) as { proposalId: string };
    assert.equal(
      (await readState()).claims.find((x) => x.id === c.id)?.status,
      "DRAFT",
    );
    await assert.rejects(
      mutate((state) => confirmProposal(state, manager, proposal.proposalId)),
      /expired/,
    );
    await mutate((state) =>
      confirmProposal(state, employee, proposal.proposalId),
    );
    assert.equal(
      (await readState()).claims.find((x) => x.id === c.id)?.status,
      "SUBMITTED",
    );
    await assert.rejects(
      mutate((state) => confirmProposal(state, employee, proposal.proposalId)),
      /expired/,
    );
    await assert.rejects(
      managerTools
        .find((t) => t.name === "approveClaim")!
        .run({ id: s.claims[1].id, comment: "Unauthorized foreign review" }),
      /not found|Cannot move/,
    );
    assert(
      (await getTools(s.profiles[7])
        .find((t) => t.name === "getFinanceAnalytics")!
        .run({})) as object,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("receipt validation identifies real signatures and rejects invented extraction totals", () => {
  assert.equal(detectMime(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(detectMime(Buffer.from("fake document")), null);
  assert(!extractionSchema.safeParse({ total: "guessed 1200" }).success);
});
