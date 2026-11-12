import type { Expense } from "./types";
export function formatMinor(amount: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
export function seededEvidence(e: Expense) {
  return `FICTIONAL DEMO EVIDENCE\n\nThis is a seeded transaction summary, not an original receipt or verified document.\nMerchant: ${e.merchant}\nAmount: ${formatMinor(e.amountMinor, e.currency)}\nDate: ${e.date}\nReference: ${e.receiptNumber}\n\nUpload a real document to exercise private storage and Gemini extraction.`;
}
