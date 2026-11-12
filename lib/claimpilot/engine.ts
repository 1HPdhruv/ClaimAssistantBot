import { formatMinor } from "./evidence";
import type {
  Claim,
  Expense,
  Finding,
  Policy,
  Profile,
  Receipt,
  State,
  Status,
  Trip,
} from "./types";
export class DomainError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assertRole(actor: Profile, roles: string[]) {
  if (!roles.includes(actor.role))
    throw new DomainError("This action is not permitted for your role", 403);
}
export function canRead(actor: Profile, owner: string, profiles: Profile[]) {
  return (
    actor.id === owner ||
    actor.role === "finance" ||
    (actor.role === "manager" &&
      profiles.find((p) => p.id === owner)?.managerId === actor.id)
  );
}
export function requireRead(
  actor: Profile,
  owner: string,
  profiles: Profile[],
) {
  if (!canRead(actor, owner, profiles))
    throw new DomainError("Record not found", 404);
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export function duplicates(
  e: Expense,
  all: Expense[],
  receipts: Receipt[],
): Finding[] {
  const r = receipts.find((r) => r.id === e.receiptId);
  const out: Finding[] = [];
  for (const other of all) {
    if (other.id === e.id) continue;
    const o = receipts.find((r) => r.id === other.receiptId);
    const exact = !!r?.hash && r.hash === o?.hash;
    const reference =
      !!e.receiptNumber &&
      norm(e.receiptNumber) === norm(other.receiptNumber) &&
      norm(e.merchant) === norm(other.merchant);
    const fuzzy =
      e.amountMinor === other.amountMinor &&
      e.currency === other.currency &&
      e.date === other.date &&
      norm(e.merchant) === norm(other.merchant);
    if (exact || reference || fuzzy)
      out.push(
        finding(
          e,
          "duplicate",
          exact ? "Critical" : "High",
          exact
            ? "Identical document SHA-256"
            : reference
              ? "Matching receipt reference"
              : "Merchant, amount, currency and date match",
          `${other.id} · ${other.merchant}`,
          "A unique supporting transaction",
          `${exact ? "Identical file bytes" : reference ? "Same merchant and receipt number" : "Potential duplicate metadata"} found in another expense. Repeated purchases can be legitimate; human review is required.`,
          "Compare both records and original documents",
          [other.id],
          exact ? 40 : 25,
        ),
      );
  }
  return out;
}
function finding(
  e: Expense,
  type: string,
  severity: Finding["severity"],
  rule: string,
  observed: string,
  expected: string,
  explanation: string,
  action: string,
  relatedIds: string[] = [],
  weight = 10,
  policyId?: string,
): Finding {
  return {
    id: `${e.id}:${type}:${policyId ?? relatedIds.join(",")}`,
    expenseId: e.id,
    type,
    severity,
    rule,
    observed,
    expected,
    explanation,
    action,
    relatedIds,
    weight,
    policyId,
    evaluatedAt: new Date().toISOString(),
  };
}
export function applicable(e: Expense, policies: Policy[], profile: Profile) {
  return policies.filter(
    (p) =>
      p.category === e.category &&
      p.currency === e.currency &&
      e.date >= p.effectiveFrom &&
      e.date <= p.effectiveTo &&
      (p.department === "*" || p.department === profile.department) &&
      (p.role === "*" || p.role === profile.role),
  );
}
export function evaluate(
  e: Expense,
  all: Expense[],
  policies: Policy[],
  profile: Profile,
  trip?: Trip,
): Finding[] {
  const out: Finding[] = [];
  const rules = applicable(e, policies, profile);
  if (!rules.length)
    out.push(
      finding(
        e,
        "policy_missing",
        "Medium",
        "Applicable policy",
        "No applicable currency/category policy",
        "Finance review",
        "No conversion or allowance was assumed.",
        "Ask finance to determine eligibility",
        [],
        5,
      ),
    );
  for (const p of rules) {
    const peers = all.filter(
      (x) =>
        x.employeeId === e.employeeId &&
        x.category === e.category &&
        x.currency === e.currency &&
        x.date === e.date,
    );
    const observed =
      p.basis === "day"
        ? peers.reduce((a, x) => a + x.amountMinor, 0)
        : e.amountMinor;
    const limit = p.limitMinor * (p.basis === "night" ? e.nights : 1);
    if (observed > limit)
      out.push(
        finding(
          e,
          "policy_excess",
          p.severity === "hard" ? "High" : "Medium",
          `${p.category} ${p.basis} allowance`,
          formatMinor(observed, e.currency),
          formatMinor(limit, e.currency),
          `${p.category} exceeds the configured ${p.basis} allowance by ${formatMinor(observed - limit, e.currency)}. ${p.condition}`,
          "Provide a business justification for manager exception review",
          [],
          15,
          p.id,
        ),
      );
  }
  if (!e.receiptId)
    out.push(
      finding(
        e,
        "missing_document",
        "Medium",
        "Supporting document",
        "No receipt",
        "Original receipt",
        "Supporting documentation is missing.",
        "Attach a receipt or request a documented exception",
        [],
        10,
      ),
    );
  if (trip && (e.date < trip.startDate || e.date > trip.endDate))
    out.push(
      finding(
        e,
        "trip_dates",
        "High",
        "Trip date consistency",
        e.date,
        `${trip.startDate} to ${trip.endDate}`,
        "Transaction falls outside the associated business trip.",
        "Clarify the transaction date and business context",
        [],
        20,
      ),
    );
  if (e.category === "Flights" && e.cabin !== "Economy")
    out.push(
      finding(
        e,
        "flight_class",
        "Medium",
        "Economy flight policy",
        e.cabin,
        "Economy",
        "Flight cabin requires clarification or exception.",
        "Supply cabin evidence or request an exception",
        [],
        10,
      ),
    );
  const history = all.filter(
    (x) =>
      x.id !== e.id &&
      x.employeeId === e.employeeId &&
      x.category === e.category &&
      x.currency === e.currency &&
      x.date < e.date,
  );
  if (history.length >= 3) {
    const avg = Math.floor(
      history.reduce((s, x) => s + x.amountMinor, 0) / history.length,
    );
    if (e.amountMinor > avg * 3)
      out.push(
        finding(
          e,
          "historical_amount",
          "Medium",
          "Historical category spending",
          formatMinor(e.amountMinor, e.currency),
          `Historical average ${formatMinor(avg, e.currency)}`,
          "Amount exceeds three times the average of earlier same-category transactions.",
          "Review business context",
          [],
          10,
        ),
      );
  }
  if (
    all.filter((x) => x.employeeId === e.employeeId && x.date === e.date)
      .length > 8
  )
    out.push(
      finding(
        e,
        "frequency",
        "Low",
        "Daily transaction frequency",
        "More than eight transactions",
        "Review unusual frequency",
        "High transaction count on one day.",
        "Check transaction context",
        [],
        5,
      ),
    );
  return out;
}
export function investigate(expenses: Expense[], state: State) {
  const findings = expenses.flatMap((e) => {
    const profile = state.profiles.find((p) => p.id === e.employeeId)!;
    const receipt = state.receipts.find((r) => r.id === e.receiptId);
    const extra: Finding[] = [];
    const extracted = receipt?.extraction;
    if (
      extracted &&
      typeof extracted.total === "string" &&
      /^\d+(\.\d{1,2})?$/.test(extracted.total)
    ) {
      const [a, b = ""] = extracted.total.split(".");
      if (Number(a) * 100 + Number(b.padEnd(2, "0")) !== e.amountMinor)
        extra.push(
          finding(
            e,
            "total_conflict",
            "High",
            "Receipt total consistency",
            formatMinor(e.amountMinor, e.currency),
            formatMinor(Number(a) * 100 + Number(b.padEnd(2, "0")), e.currency),
            "Employee amount differs from extracted receipt total. OCR may be incorrect.",
            "Compare with the original receipt and corrections",
            [],
            15,
          ),
        );
    }
    if (extracted?.category && extracted.category !== e.category)
      extra.push(
        finding(
          e,
          "category_mismatch",
          "Low",
          "Receipt category consistency",
          e.category,
          String(extracted.category),
          "Employee category differs from AI extraction; AI classification is unverified.",
          "Review original document",
          [],
          5,
        ),
      );
    return [
      ...evaluate(
        e,
        state.expenses,
        state.policies,
        profile,
        state.trips.find((t) => t.id === e.tripId),
      ),
      ...duplicates(e, state.expenses, state.receipts),
      ...extra,
    ];
  });
  const score = Math.min(
    100,
    findings.reduce((a, f) => a + f.weight, 0),
  );
  return {
    findings,
    score,
    level:
      score >= 70
        ? "Critical"
        : score >= 40
          ? "High"
          : score >= 15
            ? "Medium"
            : "Low",
    explanation:
      "Score = sum of displayed signal weights, capped at 100. Flags are review indicators, not proof of fraud.",
  };
}
export function calculate(
  expenses: Expense[],
  state: State,
  exceptionApproved = false,
  rejected = false,
  approved = false,
) {
  const totals: Record<
    string,
    {
      submitted: number;
      eligible: number;
      excess: number;
      approved: number | null;
    }
  > = {};
  const lines = expenses.map((e) => {
    let eligible = e.amountMinor;
    const profile = state.profiles.find((p) => p.id === e.employeeId)!;
    const rules = applicable(e, state.policies, profile);
    if (!rules.length || !e.receiptId) eligible = 0;
    for (const p of rules) {
      let cap = p.limitMinor * (p.basis === "night" ? e.nights : 1);
      if (p.basis === "day") {
        const peers = state.expenses
          .filter(
            (x) =>
              x.employeeId === e.employeeId &&
              x.currency === e.currency &&
              x.category === e.category &&
              x.date === e.date,
          )
          .sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          );
        let used = 0;
        for (const peer of peers) {
          if (peer.id === e.id) break;
          used += peer.amountMinor;
        }
        cap = Math.max(0, cap - used);
      }
      eligible = Math.min(eligible, cap);
    }
    if (exceptionApproved) eligible = e.amountMinor;
    if (rejected) eligible = 0;
    const t = (totals[e.currency] ??= {
      submitted: 0,
      eligible: 0,
      excess: 0,
      approved: null,
    });
    t.submitted += e.amountMinor;
    t.eligible += eligible;
    t.excess += e.amountMinor - eligible;
    if (approved || rejected) t.approved = (t.approved ?? 0) + eligible;
    return {
      expenseId: e.id,
      submitted: e.amountMinor,
      eligible,
      excess: e.amountMinor - eligible,
      currency: e.currency,
      reason: exceptionApproved
        ? "Documented manager exception"
        : !e.receiptId
          ? "Documentation review required"
          : !rules.length
            ? "No applicable policy; finance review required"
            : "Policy cap; daily allowance allocated chronologically",
    };
  });
  return { totals, lines };
}
const transitions: Record<Status, Status[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "REJECTED", "NEEDS_INFORMATION"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "NEEDS_INFORMATION"],
  NEEDS_INFORMATION: ["SUBMITTED"],
  APPROVED: ["FINANCE_VERIFICATION"],
  FINANCE_VERIFICATION: ["REIMBURSEMENT_PROCESSING", "NEEDS_INFORMATION"],
  REIMBURSEMENT_PROCESSING: ["REIMBURSED"],
  REIMBURSED: [],
  REJECTED: [],
};
export function authorizeTransition(
  actor: Profile,
  claim: Claim,
  next: Status,
  profiles: Profile[],
  comment: string,
) {
  if (!transitions[claim.status].includes(next))
    throw new DomainError(`Cannot move ${claim.status} to ${next}`, 409);
  if (next === "SUBMITTED") {
    if (actor.id !== claim.employeeId)
      throw new DomainError("Only the owner can submit", 403);
  } else if (
    ["UNDER_REVIEW", "APPROVED", "REJECTED", "NEEDS_INFORMATION"].includes(
      next,
    ) &&
    !["FINANCE_VERIFICATION"].includes(claim.status)
  ) {
    assertRole(actor, ["manager"]);
    if (
      actor.id === claim.employeeId ||
      profiles.find((p) => p.id === claim.employeeId)?.managerId !== actor.id
    )
      throw new DomainError(
        "Only the assigned manager may review; self-approval is forbidden",
        403,
      );
  } else {
    assertRole(actor, ["finance"]);
    if (actor.id === claim.employeeId)
      throw new DomainError("Self-verification is forbidden", 403);
  }
  if (
    ["REJECTED", "NEEDS_INFORMATION"].includes(next) &&
    comment.trim().length < 3
  )
    throw new DomainError("A reason or clarification question is required");
}

export function calculateClaim(claim: Claim, state: State) {
  const result = calculate(
    state.expenses.filter((e) => claim.expenseIds.includes(e.id)),
    state,
    claim.exceptionApproved,
    claim.status === "REJECTED",
    [
      "APPROVED",
      "FINANCE_VERIFICATION",
      "REIMBURSEMENT_PROCESSING",
      "REIMBURSED",
    ].includes(claim.status),
  );
  if (claim.approvedTotals)
    for (const [currency, total] of Object.entries(result.totals))
      total.approved = claim.approvedTotals[currency] ?? 0;
  return result;
}
