import type { Profile, State } from "./types";
import { assertRole, calculate, investigate } from "./engine";
export function analytics(
  s: State,
  a: Profile,
  from = "0000-01-01",
  to = "9999-12-31",
) {
  assertRole(a, ["finance"]);
  const claims = s.claims.filter(
    (c) => c.createdAt.slice(0, 10) >= from && c.createdAt.slice(0, 10) <= to,
  );
  const submittedExpenseIds = new Set(
    s.claims.filter((c) => c.status !== "DRAFT").flatMap((c) => c.expenseIds),
  );
  const expenses = s.expenses.filter(
    (e) => e.date >= from && e.date <= to && submittedExpenseIds.has(e.id),
  );
  const byCategory: Record<string, Record<string, number>> = {};
  const byDepartment: Record<string, Record<string, number>> = {};
  const monthly: Record<string, Record<string, number>> = {};
  const total: Record<string, number> = {};
  for (const e of expenses) {
    total[e.currency] = (total[e.currency] || 0) + e.amountMinor;
    for (const [group, key] of [
      [byCategory, e.category],
      [
        byDepartment,
        s.profiles.find((p) => p.id === e.employeeId)?.department || "Unknown",
      ],
      [monthly, e.date.slice(0, 7)],
    ] as const) {
      group[key] ??= {};
      group[key][e.currency] = (group[key][e.currency] || 0) + e.amountMinor;
    }
  }
  const approved: Record<string, number> = {},
    reimbursed: Record<string, number> = {},
    pending: Record<string, number> = {};
  for (const c of claims) {
    const calc = calculate(
      s.expenses.filter((e) => c.expenseIds.includes(e.id)),
      s,
      c.exceptionApproved,
      c.status === "REJECTED",
    );
    if (
      [
        "APPROVED",
        "FINANCE_VERIFICATION",
        "REIMBURSEMENT_PROCESSING",
        "REIMBURSED",
      ].includes(c.status)
    )
      for (const [cur, t] of Object.entries(calc.totals))
        approved[cur] =
          (approved[cur] || 0) + (c.approvedTotals?.[cur] ?? t.eligible);
    if (
      ["APPROVED", "FINANCE_VERIFICATION", "REIMBURSEMENT_PROCESSING"].includes(
        c.status,
      )
    )
      for (const [cur, t] of Object.entries(calc.totals))
        pending[cur] =
          (pending[cur] || 0) + (c.approvedTotals?.[cur] ?? t.eligible);
  }
  for (const r of s.reimbursements.filter(
    (r) => r.date >= from && r.date <= to,
  ))
    for (const [cur, amount] of Object.entries(r.totals))
      reimbursed[cur] = (reimbursed[cur] || 0) + amount;
  const investigations = claims.map((c) =>
    investigate(
      s.expenses.filter((e) => c.expenseIds.includes(e.id)),
      s,
    ),
  );
  const times = s.audits
    .filter(
      (x) => x.action === "APPROVED" && claims.some((c) => c.id === x.entityId),
    )
    .map(
      (x) =>
        (new Date(x.at).getTime() -
          new Date(
            claims.find((c) => c.id === x.entityId)!.createdAt,
          ).getTime()) /
        3600000,
    );
  return {
    total,
    approved,
    reimbursed,
    pending,
    byCategory,
    byDepartment,
    monthly,
    claimsAwaitingApproval: claims.filter((c) =>
      ["SUBMITTED", "UNDER_REVIEW"].includes(c.status),
    ).length,
    policyExceptions: investigations
      .flatMap((i) => i.findings)
      .filter((f) => f.type === "policy_excess").length,
    potentialDuplicates: investigations
      .flatMap((i) => i.findings)
      .filter((f) => f.type === "duplicate").length,
    highRisk: investigations.filter((i) => i.score >= 40).length,
    averageApprovalHours: times.length
      ? times.reduce((a, b) => a + b, 0) / times.length
      : null,
  };
}
