import { calculate } from "./engine";
import { createHash } from "node:crypto";
import { seededEvidence } from "./evidence";
import type { State, Expense, Claim, Category } from "./types";
export const uid = (n: number) =>
  `20260000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function seedState(): State {
  const profiles = [
    {
      id: uid(1),
      name: "Aarav Sharma",
      role: "employee" as const,
      department: "Engineering",
      managerId: uid(6),
    },
    {
      id: uid(2),
      name: "Priya Mehta",
      role: "employee" as const,
      department: "Sales",
      managerId: uid(7),
    },
    {
      id: uid(3),
      name: "Rohan Das",
      role: "employee" as const,
      department: "Engineering",
      managerId: uid(6),
    },
    {
      id: uid(4),
      name: "Ananya Rao",
      role: "employee" as const,
      department: "Operations",
      managerId: uid(7),
    },
    {
      id: uid(5),
      name: "Kabir Shah",
      role: "employee" as const,
      department: "Sales",
      managerId: uid(7),
    },
    {
      id: uid(6),
      name: "Neha Kapoor",
      role: "manager" as const,
      department: "Engineering",
    },
    {
      id: uid(7),
      name: "Vikram Singh",
      role: "manager" as const,
      department: "Sales",
    },
    {
      id: uid(8),
      name: "Isha Patel",
      role: "finance" as const,
      department: "Operations",
    },
  ];
  const trips = [
    ["Bengaluru client visit", "Bengaluru", "2026-11-02", "2026-11-05"],
    ["Mumbai partner summit", "Mumbai", "2026-10-14", "2026-10-17"],
    ["Delhi operations review", "New Delhi", "2026-11-16", "2026-11-19"],
    ["Hyderabad product workshop", "Hyderabad", "2026-10-05", "2026-10-08"],
  ].map((t, i) => ({
    id: uid(20 + i),
    employeeId: i === 0 ? uid(1) : uid(i + 1),
    name: t[0],
    origin: "Pune",
    destination: t[1],
    startDate: t[2],
    endDate: t[3],
    purpose: "Client and project collaboration",
    project: ["Atlas", "Horizon", "Launch", "Orbit"][i],
    department: profiles[i].department,
    status: i === 2 ? ("planned" as const) : ("completed" as const),
  }));
  const policies = (
    [
      ["Meals", 150000, "day"],
      ["Accommodation", 700000, "night"],
      ["Local transportation", 200000, "day"],
      ["Internet", 50000, "day"],
      ["Flights", 5000000, "transaction"],
      ["Client entertainment", 300000, "transaction"],
      ["Office supplies", 500000, "transaction"],
      ["Fuel", 200000, "day"],
      ["Parking", 50000, "day"],
      ["Communication", 100000, "transaction"],
      ["Other business expenses", 100000, "transaction"],
    ] as [Category, number, "day" | "night" | "transaction"][]
  ).map(([category, limitMinor, basis], i) => ({
    id: uid(40 + i),
    category,
    currency: "INR",
    limitMinor,
    basis,
    department: "*",
    role: "*",
    severity: "warning" as const,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    condition:
      category === "Flights"
        ? "Economy only; exceptions require manager justification."
        : "Justified exceptions require assigned-manager approval.",
    approvalRequired: true,
  }));
  const raw: [string, Category, number, string, number, number, string][] = [
    [
      "The Oberoi Bengaluru",
      "Accommodation",
      850000,
      "2026-11-02",
      1,
      20,
      "OB-142",
    ],
    ["MTR Restaurant", "Meals", 180000, "2026-11-03", 1, 20, "MTR-401"],
    [
      "Bluebird Cabs",
      "Local transportation",
      220000,
      "2026-11-04",
      1,
      20,
      "TX-991",
    ],
    ["IndiGo", "Flights", 740000, "2026-11-02", 1, 20, "6E-142"],
    [
      "Olive Bar & Kitchen",
      "Client entertainment",
      360000,
      "2026-11-06",
      1,
      20,
      "",
    ],
    [
      "Bluebird Cabs",
      "Local transportation",
      220000,
      "2026-11-04",
      3,
      20,
      "TX-991",
    ],
    ["WeWork Mumbai", "Office supplies", 124000, "2026-10-15", 2, 21, "WW-802"],
    [
      "Airport Express",
      "Local transportation",
      64000,
      "2026-10-16",
      2,
      21,
      "AX-21",
    ],
    [
      "Courtyard Marriott",
      "Accommodation",
      620000,
      "2026-10-06",
      4,
      23,
      "CM-33",
    ],
    ["Cafe Coffee Day", "Meals", 85000, "2026-10-07", 4, 23, "CCD-32"],
    ["MTR Restaurant", "Meals", 180000, "2026-11-03", 1, 20, "MTR-401"],
    ["Airtel Business", "Internet", 45000, "2026-11-10", 1, 20, "AIR-91"],
    ["IndiGo", "Flights", 540000, "2026-10-04", 5, 23, "6E-829"],
    ["Staples India", "Office supplies", 185000, "2026-11-10", 1, 20, "ST-90"],
  ];
  const expenses: Expense[] = raw.map(
    (
      [merchant, category, amountMinor, date, owner, trip, receiptNumber],
      i,
    ) => ({
      id: uid(100 + i),
      employeeId: uid(owner),
      merchant,
      category,
      amountMinor,
      currency: "INR",
      date,
      taxMinor: 0,
      purpose: "Business travel and client collaboration",
      tripId: uid(trip),
      receiptId: i === 4 ? "" : uid(200 + i),
      receiptNumber,
      nights: 1,
      cabin: category === "Flights" ? "Economy" : "Unknown",
      status: i >= 11 ? "draft" : "claimed",
      createdAt: `2026-11-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
    }),
  );
  const receipts = expenses
    .filter((e) => e.receiptId)
    .map((e, i) => ({
      id: e.receiptId,
      employeeId: e.employeeId,
      name: `${e.merchant} — fictional evidence.txt`,
      mime: "text/plain",
      hash: createHash("sha256").update(seededEvidence(e)).digest("hex"),
      path: "",
      extractionStatus: "unavailable" as const,
      extraction: null,
      error: "Fictional seeded evidence; no AI extraction was performed.",
      extractedAt: null,
      createdAt: e.createdAt,
      seeded: true,
      seededContent: seededEvidence(e),
    }));
  const claims: Claim[] = [
    {
      owner: 1,
      title: "Bengaluru · Atlas client visit",
      ids: [0, 1, 2, 3, 4],
      status: "SUBMITTED",
    },
    {
      owner: 2,
      title: "Mumbai partner summit",
      ids: [6, 7],
      status: "REIMBURSED",
    },
    {
      owner: 3,
      title: "Bengaluru local travel",
      ids: [5],
      status: "UNDER_REVIEW",
    },
    {
      owner: 4,
      title: "Hyderabad product workshop",
      ids: [8, 9],
      status: "APPROVED",
    },
    {
      owner: 1,
      title: "Client meal clarification",
      ids: [10],
      status: "NEEDS_INFORMATION",
    },
    {
      owner: 5,
      title: "Quarterly sales travel",
      ids: [12],
      status: "FINANCE_VERIFICATION",
    },
  ].map((c, i) => ({
    id: uid(300 + i),
    reference: `CLM-2026-${String(142 + i).padStart(4, "0")}`,
    employeeId: uid(c.owner),
    title: c.title,
    expenseIds: c.ids.map((n) => uid(100 + n)),
    status: c.status as Claim["status"],
    createdAt: i === 1 ? "2026-10-17T09:00:00Z" : "2026-11-07T09:00:00Z",
    updatedAt: "2026-11-09T09:00:00Z",
    exceptionReason:
      i === 0
        ? "Client site availability and late meetings required additional travel."
        : "",
    exceptionApproved: false,
    paymentReference: i === 1 ? "DEMO-NEFT-1029" : "",
    paymentDate: i === 1 ? "2026-10-29" : "",
  }));
  claims.forEach((c) =>
    c.expenseIds.forEach((id) => {
      const e = expenses.find((e) => e.id === id);
      if (e) e.status = "claimed";
    }),
  );
  const state: State = {
    profiles,
    departments: ["Engineering", "Sales", "Operations"].map((name, i) => ({
      id: uid(10 + i),
      name,
    })),
    trips,
    policies,
    expenses,
    receipts,
    claims,
    audits: claims.map((c, i) => ({
      id: uid(400 + i),
      actorId: ["REIMBURSED", "FINANCE_VERIFICATION"].includes(c.status)
        ? uid(8)
        : ["APPROVED", "UNDER_REVIEW", "NEEDS_INFORMATION"].includes(c.status)
          ? profiles.find((p) => p.id === c.employeeId)!.managerId!
          : c.employeeId,
      entityId: c.id,
      action: i === 1 ? "REIMBURSED" : c.status,
      comment: "Fictional demonstration history",
      at: c.updatedAt,
    })),
    reimbursements: [
      {
        id: uid(500),
        claimId: uid(301),
        totals: { INR: 188000 },
        reference: "DEMO-NEFT-1029",
        date: "2026-10-29",
        actorId: uid(8),
      },
    ],
  };
  for (const c of claims.filter((c) =>
    [
      "APPROVED",
      "FINANCE_VERIFICATION",
      "REIMBURSEMENT_PROCESSING",
      "REIMBURSED",
    ].includes(c.status),
  )) {
    c.approvedTotals = Object.fromEntries(
      Object.entries(
        calculate(
          expenses.filter((e) => c.expenseIds.includes(e.id)),
          state,
          c.exceptionApproved,
        ).totals,
      ).map(([cur, t]) => [cur, t.eligible]),
    );
  }
  return state;
}
