export const categories = [
  "Accommodation",
  "Meals",
  "Flights",
  "Local transportation",
  "Fuel",
  "Parking",
  "Internet",
  "Office supplies",
  "Communication",
  "Client entertainment",
  "Other business expenses",
] as const;
export type Category = (typeof categories)[number];
export type Role = "employee" | "manager" | "finance";
export type Profile = {
  id: string;
  name: string;
  role: Role;
  department: string;
  managerId?: string;
};
export type Trip = {
  id: string;
  employeeId: string;
  name: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
  purpose: string;
  project: string;
  department: string;
  status: "planned" | "active" | "completed";
};
export type Policy = {
  id: string;
  category: Category;
  currency: string;
  limitMinor: number;
  basis: "day" | "night" | "transaction";
  department: string;
  role: string;
  severity: "warning" | "hard";
  effectiveFrom: string;
  effectiveTo: string;
  condition: string;
  approvalRequired: boolean;
};
export type Expense = {
  id: string;
  employeeId: string;
  merchant: string;
  category: Category;
  amountMinor: number;
  currency: string;
  date: string;
  taxMinor: number;
  purpose: string;
  tripId: string;
  receiptId: string;
  receiptNumber: string;
  nights: number;
  cabin: string;
  status: "draft" | "claimed";
  createdAt: string;
  corrections?: Record<string, unknown>;
};
export type Receipt = {
  id: string;
  employeeId: string;
  name: string;
  mime: string;
  hash: string;
  path: string;
  extractionStatus: "extracted" | "unavailable" | "failed";
  extraction: Record<string, unknown> | null;
  error: string;
  extractedAt: string | null;
  createdAt: string;
  seeded?: boolean;
  seededContent?: string;
};
export const statuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "NEEDS_INFORMATION",
  "APPROVED",
  "FINANCE_VERIFICATION",
  "REIMBURSEMENT_PROCESSING",
  "REIMBURSED",
  "REJECTED",
] as const;
export type Status = (typeof statuses)[number];
export type Claim = {
  id: string;
  reference: string;
  employeeId: string;
  title: string;
  expenseIds: string[];
  status: Status;
  createdAt: string;
  updatedAt: string;
  exceptionReason: string;
  exceptionApproved: boolean;
  approvedTotals?: Record<string, number>;
  paymentReference: string;
  paymentDate: string;
};
export type Finding = {
  id: string;
  policyId?: string;
  expenseId: string;
  type: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  rule: string;
  observed: string;
  expected: string;
  explanation: string;
  action: string;
  relatedIds: string[];
  weight: number;
  evaluatedAt: string;
};
export type Audit = {
  internal?: boolean;
  id: string;
  actorId: string;
  entityId: string;
  action: string;
  comment: string;
  at: string;
};
export type Reimbursement = {
  id: string;
  claimId: string;
  totals: Record<string, number>;
  reference: string;
  date: string;
  actorId: string;
};
export type State = {
  profiles: Profile[];
  departments: { id: string; name: string }[];
  trips: Trip[];
  policies: Policy[];
  expenses: Expense[];
  receipts: Receipt[];
  claims: Claim[];
  audits: Audit[];
  reimbursements: Reimbursement[];
};
