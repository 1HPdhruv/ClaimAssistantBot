import { analytics } from "../lib/claimpilot/analytics";
import test from "node:test";
import assert from "node:assert/strict";
import { seedState, uid } from "../lib/claimpilot/seed";
import {
  applicable,
  authorizeTransition,
  calculate,
  canRead,
  duplicates,
  evaluate,
  investigate,
} from "../lib/claimpilot/engine";
import {
  addComment,
  createClaim,
  createExpense,
  createTrip,
  deleteExpense,
  transitionClaim,
  updateExpense,
  updatePolicy,
  viewState,
} from "../lib/claimpilot/service";
import { toMinor, expenseSchema } from "../lib/claimpilot/schemas";
const input = {
  merchant: "Business lunch",
  category: "Meals",
  amount: "1200.25",
  currency: "INR",
  date: "2026-11-12",
  tax: "100",
  purpose: "Client collaboration",
};
test("money parsing is exact; no float accumulation and invalid precision is rejected", () => {
  assert.equal(toMinor("1200.25"), 120025);
  assert.equal(toMinor("0.10") + toMinor("0.20"), 30);
  assert.throws(() => toMinor("1.234"));
  assert.throws(() => toMinor("-2"));
});
test("policy compliance for a documented within-limit transaction", () => {
  const s = seedState();
  const e = { ...s.expenses[1], amountMinor: 120000, date: "2026-11-02" };
  assert.equal(
    evaluate(e, [e], s.policies, s.profiles[0], s.trips[0]).filter(
      (f) => f.type === "policy_excess",
    ).length,
    0,
  );
});
test("daily limits aggregate meals and calculator allocates the allowance once", () => {
  const s = seedState();
  const e = { ...s.expenses[1], amountMinor: 100000 };
  const e2 = { ...e, id: uid(999), createdAt: "2026-12-01T00:00:00Z" };
  s.expenses = [e, e2];
  const findings = evaluate(e, s.expenses, s.policies, s.profiles[0]);
  assert.equal(
    findings.find((f) => f.type === "policy_excess")?.observed,
    "₹2,000.00",
  );
  const c = calculate(s.expenses, s);
  assert.equal(c.totals.INR.eligible, 150000);
  assert.equal(c.totals.INR.excess, 50000);
});
test("accommodation caps account for nights", () => {
  const s = seedState();
  const e = { ...s.expenses[0], nights: 2 };
  assert.equal(
    evaluate(e, [e], s.policies, s.profiles[0]).filter(
      (f) => f.type === "policy_excess",
    ).length,
    0,
  );
  e.nights = 1;
  assert.equal(calculate([e], s).totals.INR.eligible, 700000);
});
test("effective date, department, role and currency scopes are respected", () => {
  const s = seedState();
  const e = s.expenses[0];
  const p = { ...s.policies[1], department: "Sales" };
  assert.equal(applicable(e, [p], s.profiles[0]).length, 0);
  assert.equal(
    applicable({ ...e, currency: "USD" }, s.policies, s.profiles[0]).length,
    0,
  );
  assert.equal(
    applicable({ ...e, date: "2028-01-01" }, s.policies, s.profiles[0]).length,
    0,
  );
  assert.equal(
    applicable(e, [{ ...p, department: "*", role: "manager" }], s.profiles[0])
      .length,
    0,
  );
});
test("calculator preserves separate currencies, missing documentation and rejection", () => {
  const s = seedState();
  const usd = { ...s.expenses[0], id: uid(990), currency: "USD" };
  s.expenses.push(usd);
  const calc = calculate([s.expenses[0], s.expenses[4], usd], s);
  assert.equal(calc.totals.USD.submitted, 850000);
  assert.equal(calc.totals.USD.eligible, 0);
  assert.equal(calc.lines[1].eligible, 0);
  assert.equal(calculate([s.expenses[0]], s, true).totals.INR.eligible, 850000);
  assert.equal(
    calculate([s.expenses[0]], s, true, true).totals.INR.eligible,
    0,
  );
});
test("exact duplicate file detection references the actual other record", () => {
  const s = seedState();
  const f = duplicates(s.expenses[2], s.expenses, s.receipts);
  assert.equal(f[0].severity, "Critical");
  assert.deepEqual(f[0].relatedIds, [s.expenses[5].id]);
});
test("fuzzy duplicate match remains a potential signal; ordinary repeat purchase is not flagged", () => {
  const s = seedState();
  s.receipts = [];
  const e = s.expenses[0];
  const near = {
    ...e,
    id: uid(991),
    receiptId: "",
    receiptNumber: "",
    merchant: "THE OBEROI BENGALURU!",
  };
  const f = duplicates(e, [e, near], []);
  assert.equal(f.length, 1);
  assert.match(f[0].explanation, /Potential duplicate/);
  assert.equal(
    duplicates(e, [e, { ...near, date: "2026-11-09" }], []).length,
    0,
  );
});
test("trip dates produce evidence and never auto-reject", () => {
  const s = seedState();
  const f = evaluate(
    s.expenses[4],
    s.expenses,
    s.policies,
    s.profiles[0],
    s.trips[0],
  );
  assert.equal(f.find((f) => f.type === "trip_dates")?.observed, "2026-11-06");
  assert.equal(s.claims[0].status, "SUBMITTED");
});
test("risk assessment derives weights, caps score and produces signature demo findings", () => {
  const s = seedState();
  const c = s.claims[0];
  const r = investigate(
    s.expenses.filter((e) => c.expenseIds.includes(e.id)),
    s,
  );
  assert.equal(
    r.score,
    Math.min(
      100,
      r.findings.reduce((n, f) => n + f.weight, 0),
    ),
  );
  for (const type of [
    "policy_excess",
    "missing_document",
    "duplicate",
    "trip_dates",
  ])
    assert(r.findings.some((f) => f.type === type));
  assert(r.findings.some((f) => f.rule.startsWith("Accommodation")));
  assert(r.findings.some((f) => f.rule.startsWith("Meals")));
});
test("conflicting receipt totals and category mismatch are evidence signals", () => {
  const s = seedState();
  s.receipts.find((r) => r.id === s.expenses[0].receiptId)!.extraction = {
    total: "8400.00",
    category: "Meals",
  };
  const types = investigate([s.expenses[0]], s).findings.map((f) => f.type);
  assert(types.includes("total_conflict"));
  assert(types.includes("category_mismatch"));
});
test("employee-manager-finance lifecycle records a payment without claiming a transfer", () => {
  const s = seedState();
  const a = s.profiles[0],
    m = s.profiles[5],
    f = s.profiles[7];
  const e = createExpense(s, a, input);
  const c = createClaim(s, a, {
    title: "End-to-end claim",
    expenseIds: [e.id],
  });
  transitionClaim(s, a, c.id, { status: "SUBMITTED" });
  transitionClaim(s, m, c.id, { status: "UNDER_REVIEW" });
  transitionClaim(s, m, c.id, { status: "APPROVED" });
  transitionClaim(s, f, c.id, { status: "FINANCE_VERIFICATION" });
  transitionClaim(s, f, c.id, { status: "REIMBURSEMENT_PROCESSING" });
  assert.throws(
    () => transitionClaim(s, f, c.id, { status: "REIMBURSED" }),
    /reference/,
  );
  transitionClaim(s, f, c.id, {
    status: "REIMBURSED",
    paymentReference: "TEST-123",
    paymentDate: "2026-11-12",
  });
  assert.equal(c.status, "REIMBURSED");
  assert.equal(s.reimbursements.at(-1)?.reference, "TEST-123");
  assert.equal(s.audits.at(-1)?.action, "REIMBURSED");
  assert.throws(
    () => transitionClaim(s, f, c.id, { status: "APPROVED" }),
    /Cannot move/,
  );
});
test("role authorization rejects self-approval, cross-team manager and employee policy edits", () => {
  const s = seedState(),
    c = s.claims[0];
  assert.throws(
    () => transitionClaim(s, s.profiles[0], c.id, { status: "APPROVED" }),
    /role/,
  );
  assert.throws(
    () =>
      transitionClaim(s, { ...s.profiles[0], role: "manager" }, c.id, {
        status: "APPROVED",
      }),
    /self-approval/,
  );
  assert.throws(
    () => transitionClaim(s, s.profiles[6], c.id, { status: "APPROVED" }),
    /not found/,
  );
  const { id, ...p } = s.policies[0];
  assert.throws(() => updatePolicy(s, s.profiles[0], id, p), /role/);
});
test("employee isolation redacts other claims, duplicate private IDs and documents", () => {
  const s = seedState();
  const v = viewState(s, s.profiles[0]);
  assert(v.claims.every((c) => c.employeeId === uid(1)));
  assert(v.receipts.every((r) => r.employeeId === uid(1)));
  assert(
    v.evaluations
      .flatMap((e) => e.findings)
      .every((f) => !f.relatedIds.includes(s.expenses[5].id)),
  );
  assert(!canRead(s.profiles[0], uid(2), s.profiles));
  assert.throws(
    () => addComment(s, s.profiles[0], s.claims[1].id, { comment: "Hello" }),
    /not found/,
  );
});
test("clarification requires a reason, permits corrections and requires an owner response", () => {
  const s = seedState();
  const c = s.claims[0];
  assert.throws(
    () =>
      transitionClaim(s, s.profiles[5], c.id, { status: "NEEDS_INFORMATION" }),
    /reason/,
  );
  transitionClaim(s, s.profiles[5], c.id, {
    status: "NEEDS_INFORMATION",
    comment: "Please attach dinner evidence",
  });
  const e = s.expenses[0];
  updateExpense(s, s.profiles[0], e.id, {
    ...input,
    merchant: "Corrected hotel",
    category: "Accommodation",
  });
  assert.equal(e.status, "claimed");
  assert.throws(
    () => transitionClaim(s, s.profiles[0], c.id, { status: "SUBMITTED" }),
    /clarification/,
  );
  transitionClaim(s, s.profiles[0], c.id, {
    status: "SUBMITTED",
    comment: "Corrected data attached",
  });
  assert.equal(c.status, "SUBMITTED");
});
test("exceptions require manager justification and audit records", () => {
  const s = seedState();
  assert.throws(
    () =>
      transitionClaim(s, s.profiles[5], s.claims[0].id, {
        status: "APPROVED",
        exceptionApproved: true,
      }),
    /justification/,
  );
  transitionClaim(s, s.profiles[5], s.claims[0].id, {
    status: "APPROVED",
    exceptionApproved: true,
    comment: "Client approved late travel and missing document exception",
  });
  assert(s.claims[0].exceptionApproved);
});
test("draft expenses can be edited/deleted but claimed records cannot be deleted or multiply claimed", () => {
  const s = seedState(),
    a = s.profiles[0];
  const e = createExpense(s, a, input);
  updateExpense(s, a, e.id, { ...input, amount: "99.99", tax: "0" });
  assert.equal(e.amountMinor, 9999);
  createClaim(s, a, { title: "Draft claim", expenseIds: [e.id] });
  assert.throws(() => deleteExpense(s, a, e.id), /draft/);
  assert.throws(
    () => createClaim(s, a, { title: "Second claim", expenseIds: [e.id] }),
    /unclaimed/,
  );
  const e2 = createExpense(s, a, input);
  deleteExpense(s, a, e2.id);
  assert(!s.expenses.some((e) => e.id === e2.id));
});
test("input rejects employee identity injection, invalid dates, impossible trips and foreign receipts", () => {
  const s = seedState();
  assert.throws(() => expenseSchema.parse({ ...input, employeeId: uid(2) }));
  assert.throws(() =>
    createExpense(s, s.profiles[0], { ...input, date: "2026-02-30" }),
  );
  assert.throws(() =>
    createExpense(s, s.profiles[0], {
      ...input,
      receiptId: s.receipts.find((r) => r.employeeId === uid(2))!.id,
    }),
  );
  assert.throws(() =>
    createTrip(s, s.profiles[0], {
      name: "Trip",
      origin: "Pune",
      destination: "Delhi",
      purpose: "Business",
      startDate: "2026-12-03",
      endDate: "2026-12-01",
    }),
  );
});

test("approved payment amounts remain frozen when a policy changes later", () => {
  const s = seedState();
  const e = createExpense(s, s.profiles[0], {
    ...input,
    receiptId: s.expenses[0].receiptId,
  });
  const c = createClaim(s, s.profiles[0], {
    title: "Approval snapshot",
    expenseIds: [e.id],
  });
  transitionClaim(s, s.profiles[0], c.id, { status: "SUBMITTED" });
  transitionClaim(s, s.profiles[5], c.id, { status: "APPROVED" });
  assert.equal(c.approvedTotals?.INR, 120025);
  s.policies.find((p) => p.category === "Meals")!.limitMinor = 1;
  transitionClaim(s, s.profiles[7], c.id, { status: "FINANCE_VERIFICATION" });
  transitionClaim(s, s.profiles[7], c.id, {
    status: "REIMBURSEMENT_PROCESSING",
  });
  transitionClaim(s, s.profiles[7], c.id, {
    status: "REIMBURSED",
    paymentReference: "FROZEN-APPROVAL",
    paymentDate: "2026-11-12",
  });
  assert.equal(s.reimbursements.at(-1)?.totals.INR, 120025);
});

test("internal review notes and cross-employee duplicate IDs remain private", () => {
  const s = seedState();
  addComment(s, s.profiles[5], s.claims[0].id, {
    comment: "Reviewer-only context",
    internal: true,
  });
  assert(
    !JSON.stringify(viewState(s, s.profiles[0])).includes(
      "Reviewer-only context",
    ),
  );
  assert(
    !JSON.stringify(viewState(s, s.profiles[0])).includes(s.expenses[5].id),
  );
  assert(
    JSON.stringify(viewState(s, s.profiles[5])).includes(
      "Reviewer-only context",
    ),
  );
  assert.throws(
    () =>
      addComment(s, s.profiles[0], s.claims[0].id, {
        comment: "Employee internal note",
        internal: true,
      }),
    /role/,
  );
});

test("clarification resubmission invalidates prior exception and approval amounts", () => {
  const s = seedState();
  const c = s.claims[0];
  transitionClaim(s, s.profiles[5], c.id, {
    status: "APPROVED",
    exceptionApproved: true,
    comment: "Documented original business exception",
  });
  transitionClaim(s, s.profiles[7], c.id, { status: "FINANCE_VERIFICATION" });
  transitionClaim(s, s.profiles[7], c.id, {
    status: "NEEDS_INFORMATION",
    comment: "Please clarify the missing dinner receipt",
  });
  transitionClaim(s, s.profiles[0], c.id, {
    status: "SUBMITTED",
    comment: "Corrected supporting context for renewed review",
  });
  assert.equal(c.exceptionApproved, false);
  assert.equal(c.approvedTotals, undefined);
  transitionClaim(s, s.profiles[5], c.id, {
    status: "APPROVED",
    comment: "Approve standard amount only",
  });
  assert.equal(c.exceptionApproved, false);
  assert.equal(
    s.claims.find((x) => x.id === c.id)?.approvedTotals?.INR,
    1790000,
  );
});

test("finance submitted-spend aggregates exclude unclaimed expenses and unsubmitted drafts", () => {
  const s = seedState();
  const before = analytics(s, s.profiles[7]).total.INR;
  const e = createExpense(s, s.profiles[0], input);
  assert.equal(analytics(s, s.profiles[7]).total.INR, before);
  const c = createClaim(s, s.profiles[0], {
    title: "Unsubmitted analytics draft",
    expenseIds: [e.id],
  });
  assert.equal(analytics(s, s.profiles[7]).total.INR, before);
  transitionClaim(s, s.profiles[0], c.id, { status: "SUBMITTED" });
  assert.equal(analytics(s, s.profiles[7]).total.INR, before + 120025);
});
