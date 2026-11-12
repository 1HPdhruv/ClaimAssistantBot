import { z } from "zod";
import { categories, statuses } from "./types";
export const dateSchema = z.iso.date();
export const moneySchema = z
  .string()
  .regex(
    /^\d{1,9}(\.\d{1,2})?$/,
    "Use a positive amount with at most two decimal places",
  );
export function toMinor(value: string) {
  const [a, b = ""] = moneySchema.parse(value).split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
export const expenseSchema = z
  .object({
    merchant: z.string().trim().min(2).max(120),
    category: z.enum(categories),
    amount: moneySchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    date: dateSchema,
    tax: moneySchema.default("0"),
    purpose: z.string().trim().min(3).max(1000),
    tripId: z.string().default(""),
    receiptId: z.string().default(""),
    receiptNumber: z.string().max(100).default(""),
    nights: z.number().int().min(1).max(365).default(1),
    cabin: z
      .enum(["Economy", "Business", "First", "Unknown"])
      .default("Unknown"),
  })
  .strict();
export const tripSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    origin: z.string().min(2).max(100),
    destination: z.string().min(2).max(100),
    startDate: dateSchema,
    endDate: dateSchema,
    purpose: z.string().min(3).max(1000),
    project: z.string().max(120).default(""),
    status: z.enum(["planned", "active", "completed"]).default("planned"),
  })
  .strict()
  .refine((t) => t.endDate >= t.startDate, "End date must follow start date");
export const claimSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    expenseIds: z.array(z.string().uuid()).min(1).max(100),
    exceptionReason: z.string().max(2000).default(""),
  })
  .strict();
export const transitionSchema = z
  .object({
    status: z.enum(statuses),
    comment: z.string().max(2000).default(""),
    exceptionApproved: z.boolean().default(false),
    paymentReference: z.string().max(150).default(""),
    paymentDate: dateSchema.optional(),
  })
  .strict();
export const policySchema = z
  .object({
    category: z.enum(categories),
    currency: z.string().regex(/^[A-Z]{3}$/),
    limitMinor: z.number().int().min(0).max(10000000000),
    basis: z.enum(["day", "night", "transaction"]),
    department: z.string().max(100).default("*"),
    role: z.enum(["*", "employee", "manager", "finance"]).default("*"),
    severity: z.enum(["warning", "hard"]).default("warning"),
    effectiveFrom: dateSchema,
    effectiveTo: dateSchema,
    condition: z.string().max(500).default(""),
    approvalRequired: z.boolean().default(true),
  })
  .strict()
  .refine((p) => p.effectiveTo >= p.effectiveFrom, "Invalid effective dates");
