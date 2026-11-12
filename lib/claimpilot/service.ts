import type { Profile, State, Claim } from "./types";
import { z } from "zod";
import {
  expenseSchema,
  tripSchema,
  claimSchema,
  transitionSchema,
  policySchema,
  toMinor,
} from "./schemas";
import {
  assertRole,
  authorizeTransition,
  calculate,
  calculateClaim,
  canRead,
  DomainError,
  investigate,
  requireRead,
} from "./engine";
export function audit(
  s: State,
  a: Profile,
  entityId: string,
  action: string,
  comment = "",
  internal = false,
) {
  s.audits.push({
    id: crypto.randomUUID(),
    actorId: a.id,
    entityId,
    action,
    comment,
    internal,
    at: new Date().toISOString(),
  });
}
export function viewState(s: State, a: Profile) {
  const expenses = s.expenses.filter((e) =>
    canRead(a, e.employeeId, s.profiles),
  );
  const claims = s.claims.filter((c) => canRead(a, c.employeeId, s.profiles));
  const allowed = new Set([
    ...expenses.map((e) => e.id),
    ...claims.map((c) => c.id),
  ]);
  return {
    ...s,
    profiles: s.profiles.filter((p) => canRead(a, p.id, s.profiles)),
    expenses,
    claims,
    trips: s.trips.filter((t) => canRead(a, t.employeeId, s.profiles)),
    receipts: s.receipts
      .filter((r) => canRead(a, r.employeeId, s.profiles))
      .map(({ path: _, hash: __, ...r }) => r),
    audits: s.audits.filter(
      (x) =>
        (a.role === "finance" ||
          allowed.has(x.entityId) ||
          x.actorId === a.id) &&
        (a.role !== "employee" || !x.internal),
    ),
    reimbursements: s.reimbursements.filter((r) =>
      claims.some((c) => c.id === r.claimId),
    ),
    expenseEvaluations: Object.fromEntries(
      expenses.map((e) => [
        e.id,
        {
          ...redactInvestigation(investigate([e], s), a, s),
          calculation: calculate([e], s),
        },
      ]),
    ),
    evaluations: claims.map((c) => ({
      claimId: c.id,
      ...redactInvestigation(
        investigate(
          expenses.filter((e) => c.expenseIds.includes(e.id)),
          s,
        ),
        a,
        s,
      ),
      calculation: calculateClaim(c, s),
    })),
  };
}
export function redactInvestigation(
  result: ReturnType<typeof investigate>,
  a: Profile,
  s: State,
) {
  return {
    ...result,
    findings: result.findings.map((f, index) => ({
      ...f,
      id: `${f.expenseId}:${f.type}:${index}`,
      observed:
        f.type === "duplicate" && a.role === "employee"
          ? "Matching transaction detected; reviewer can inspect evidence"
          : f.observed,
      relatedIds: f.relatedIds.filter((id) => {
        const e = s.expenses.find((e) => e.id === id);
        return e && canRead(a, e.employeeId, s.profiles);
      }),
    })),
  };
}
export function createExpense(s: State, a: Profile, input: unknown) {
  const d = expenseSchema.parse(input);
  if (toMinor(d.amount) <= 0)
    throw new DomainError("Amount must be greater than zero");
  if (toMinor(d.tax) > toMinor(d.amount))
    throw new DomainError("Tax cannot exceed total");
  if (
    d.tripId &&
    !s.trips.some((t) => t.id === d.tripId && t.employeeId === a.id)
  )
    throw new DomainError("Select your own trip");
  if (
    d.receiptId &&
    !s.receipts.some((r) => r.id === d.receiptId && r.employeeId === a.id)
  )
    throw new DomainError("Receipt not found");
  const { amount, tax, ...fields } = d;
  const e = {
    ...fields,
    id: crypto.randomUUID(),
    employeeId: a.id,
    amountMinor: toMinor(amount),
    taxMinor: toMinor(tax),
    status: "draft" as const,
    createdAt: new Date().toISOString(),
    corrections: d.receiptId ? { reviewedFields: d } : undefined,
  };
  s.expenses.push(e);
  audit(s, a, e.id, "EXPENSE_CREATED", "Employee-reviewed fields");
  return e;
}
export function updateExpense(
  s: State,
  a: Profile,
  id: string,
  input: unknown,
) {
  const e = s.expenses.find((e) => e.id === id && e.employeeId === a.id);
  if (!e) throw new DomainError("Expense not found", 404);
  const claim = s.claims.find((c) => c.expenseIds.includes(id));
  if (
    e.status !== "draft" &&
    (!claim || !["DRAFT", "NEEDS_INFORMATION"].includes(claim.status))
  )
    throw new DomainError(
      "Only drafts or claims awaiting clarification can be edited",
      409,
    );
  const priorStatus = e.status;
  const created = createExpense(s, a, input);
  Object.assign(e, created, {
    id,
    createdAt: e.createdAt,
    status: priorStatus,
  });
  s.expenses = s.expenses.filter((x) => x.id !== created.id);
  audit(s, a, id, "EXPENSE_UPDATED");
  return e;
}
export function deleteExpense(s: State, a: Profile, id: string) {
  const e = s.expenses.find((e) => e.id === id && e.employeeId === a.id);
  if (!e) throw new DomainError("Expense not found", 404);
  if (e.status !== "draft")
    throw new DomainError("Only draft expenses can be deleted", 409);
  s.expenses = s.expenses.filter((x) => x.id !== id);
  audit(s, a, id, "EXPENSE_DELETED");
  return { deleted: id };
}
export function createTrip(s: State, a: Profile, input: unknown) {
  const d = tripSchema.parse(input);
  const t = {
    ...d,
    id: crypto.randomUUID(),
    employeeId: a.id,
    department: a.department,
  };
  s.trips.push(t);
  audit(s, a, t.id, "TRIP_CREATED");
  return t;
}
export function createClaim(s: State, a: Profile, input: unknown): Claim {
  const d = claimSchema.parse(input);
  if (new Set(d.expenseIds).size !== d.expenseIds.length)
    throw new DomainError("An expense may only appear once");
  for (const id of d.expenseIds) {
    if (
      !s.expenses.some(
        (e) => e.id === id && e.employeeId === a.id && e.status === "draft",
      )
    )
      throw new DomainError("Select your own unclaimed draft expenses");
  }
  const now = new Date().toISOString();
  const c = {
    ...d,
    id: crypto.randomUUID(),
    reference: `CLM-2026-${String(Math.max(141, ...s.claims.map((c) => Number(c.reference.split("-").at(-1)))) + 1).padStart(4, "0")}`,
    employeeId: a.id,
    status: "DRAFT" as const,
    createdAt: now,
    updatedAt: now,
    exceptionApproved: false,
    paymentReference: "",
    paymentDate: "",
  };
  s.claims.push(c);
  s.expenses
    .filter((e) => d.expenseIds.includes(e.id))
    .forEach((e) => (e.status = "claimed"));
  audit(s, a, c.id, "DRAFT_CREATED");
  return c;
}
export function transitionClaim(
  s: State,
  a: Profile,
  id: string,
  input: unknown,
) {
  const d = transitionSchema.parse(input);
  const c = s.claims.find((c) => c.id === id);
  if (!c) throw new DomainError("Claim not found", 404);
  requireRead(a, c.employeeId, s.profiles);
  authorizeTransition(a, c, d.status, s.profiles, d.comment);
  if (d.status === "APPROVED") c.exceptionApproved = false;
  if (c.status === "NEEDS_INFORMATION" && d.status === "SUBMITTED") {
    c.exceptionApproved = false;
    delete c.approvedTotals;
  }
  if (d.exceptionApproved) {
    if (d.status !== "APPROVED" || d.comment.trim().length < 5)
      throw new DomainError(
        "An exception requires manager approval and written justification",
      );
    c.exceptionApproved = true;
  }
  if (
    c.status === "NEEDS_INFORMATION" &&
    d.status === "SUBMITTED" &&
    d.comment.trim().length < 3
  )
    throw new DomainError("Please provide your clarification");
  if (
    d.status === "APPROVED" ||
    (d.status === "FINANCE_VERIFICATION" && !c.approvedTotals)
  ) {
    const computed = calculate(
      s.expenses.filter((e) => c.expenseIds.includes(e.id)),
      s,
      c.exceptionApproved,
    );
    c.approvedTotals = Object.fromEntries(
      Object.entries(computed.totals).map(([currency, t]) => [
        currency,
        t.eligible,
      ]),
    );
  }
  if (d.status === "REIMBURSED") {
    if (!d.paymentReference.trim() || !d.paymentDate)
      throw new DomainError("Payment reference and payment date are required");
    if (d.paymentDate > new Date().toISOString().slice(0, 10))
      throw new DomainError("Payment date cannot be in the future");
    const calc = calculate(
      s.expenses.filter((e) => c.expenseIds.includes(e.id)),
      s,
      c.exceptionApproved,
    );
    s.reimbursements.push({
      id: crypto.randomUUID(),
      claimId: c.id,
      totals:
        c.approvedTotals ??
        Object.fromEntries(
          Object.entries(calc.totals).map(([currency, t]) => [
            currency,
            t.eligible,
          ]),
        ),
      reference: d.paymentReference,
      date: d.paymentDate,
      actorId: a.id,
    });
    c.paymentReference = d.paymentReference;
    c.paymentDate = d.paymentDate;
  }
  c.status = d.status;
  c.updatedAt = new Date().toISOString();
  audit(s, a, id, d.status, d.comment);
  return c;
}
export function updatePolicy(s: State, a: Profile, id: string, input: unknown) {
  assertRole(a, ["finance"]);
  const p = s.policies.find((x) => x.id === id);
  if (!p) throw new DomainError("Policy not found", 404);
  const d = policySchema.parse(input);
  audit(s, a, id, "POLICY_UPDATED", JSON.stringify({ before: p, after: d }));
  Object.assign(p, d);
  return p;
}
export function addComment(s: State, a: Profile, id: string, input: unknown) {
  const { comment, internal } = z
    .object({
      comment: z.string().trim().min(2).max(2000),
      internal: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  const c = s.claims.find((c) => c.id === id);
  if (!c) throw new DomainError("Claim not found", 404);
  requireRead(a, c.employeeId, s.profiles);
  if (internal) assertRole(a, ["manager", "finance"]);
  audit(s, a, id, "COMMENT", comment, internal);
  return { added: true };
}
