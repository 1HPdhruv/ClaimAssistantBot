"use client";
import { useState } from "react";
import { categories, type Expense, type Trip } from "@/lib/claimpilot/types";
import { Icon, request } from "./ui";
type Fields = {
  merchant: string;
  category: string;
  amount: string;
  currency: string;
  date: string;
  tax: string;
  purpose: string;
  tripId: string;
  receiptId: string;
  receiptNumber: string;
  nights: number;
  cabin: string;
};
export default function ExpenseForm({
  trips,
  expense,
  onSaved,
}: {
  trips: Trip[];
  expense?: Expense;
  onSaved: () => void;
}) {
  const [fields, setFields] = useState<Fields>(
    expense
      ? {
          ...expense,
          amount: (expense.amountMinor / 100).toFixed(2),
          tax: (expense.taxMinor / 100).toFixed(2),
        }
      : {
          merchant: "",
          category: "Meals",
          amount: "",
          currency: "INR",
          date: new Date().toLocaleDateString("en-CA", {
            timeZone: "Asia/Kolkata",
          }),
          tax: "0",
          purpose: "",
          tripId: "",
          receiptId: "",
          receiptNumber: "",
          nights: 1,
          cabin: "Unknown",
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{
    id: string;
    name: string;
    extractionStatus: string;
    error: string;
    extraction?: Record<string, unknown> | null;
  } | null>(null);
  function field<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((f) => ({ ...f, [key]: value }));
  }
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await fetch("/api/receipts", { method: "POST", body: data });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      setReceipt(r);
      setFields((f) => {
        const next = { ...f, receiptId: r.id };
        for (const [k, v] of Object.entries(r.extraction || {})) {
          const target = k === "total" ? "amount" : k;
          if (
            [
              "merchant",
              "receiptNumber",
              "date",
              "category",
              "amount",
              "tax",
              "currency",
            ].includes(target) &&
            typeof v === "string"
          )
            Object.assign(next, { [target]: v });
        }
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        [
          "merchant",
          "category",
          "amount",
          "currency",
          "date",
          "tax",
          "purpose",
          "tripId",
          "receiptId",
          "receiptNumber",
          "nights",
          "cabin",
        ].map((k) => [k, fields[k as keyof Fields]]),
      );
      await request(
        `/api/workspace/expenses${expense ? `/${expense.id}` : ""}`,
        expense ? "PATCH" : "POST",
        payload,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="submit-grid">
      <aside className="panel receipt-panel">
        <div className="section-heading">
          <h3>Start with a receipt</h3>
          <span className="tiny-label">OPTIONAL</span>
        </div>
        <label className={`upload-zone ${busy ? "disabled" : ""}`}>
          <Icon name="upload" size={32} />
          <strong>
            {busy ? "Processing your document…" : "Drop the paperwork here"}
          </strong>
          <span>
            Choose a JPG, PNG, WebP or PDF
            <br />
            Private storage · Up to 10 MB
          </span>
          <input
            aria-label="Upload receipt"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <span className="secondary">Browse files</span>
        </label>
        {receipt && (
          <div className="receipt-result">
            <strong>{receipt.name}</strong>
            <p
              className={
                receipt.extractionStatus === "extracted" ? "success" : "muted"
              }
            >
              {receipt.extractionStatus === "extracted"
                ? "Extracted by Gemini. Review every field before saving."
                : receipt.error}
            </p>
            {Array.isArray(receipt.extraction?.uncertainty) && (
              <p className="notice">
                Uncertainty:{" "}
                {String(
                  (receipt.extraction.uncertainty as string[]).join("; "),
                )}
              </p>
            )}
            <a
              href={`/api/receipts/${receipt.id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open original document ↗
            </a>
            {receipt.extractionStatus === "extracted" && (
              <details>
                <summary>View original extraction</summary>
                <pre>{JSON.stringify(receipt.extraction, null, 2)}</pre>
              </details>
            )}
            {receipt.extractionStatus === "extracted" && (
              <iframe
                title="Original receipt"
                src={`/api/receipts/${receipt.id}`}
              />
            )}
          </div>
        )}
        <div className="receipt-note">
          <Icon name="copilot" />
          <div>
            <strong>A little less admin.</strong>
            <p>
              Gemini reads your receipt. You review the details. The policy
              engine handles the checks.
            </p>
          </div>
        </div>
      </aside>
      <form className="panel expense-form" onSubmit={save}>
        <div className="section-heading">
          <div>
            <h3>{expense ? "Edit draft expense" : "Review expense details"}</h3>
            <p className="muted">
              Keep the original amount and currency. You’re always in control.
            </p>
          </div>
          <span className="step-number">01 / 02</span>
        </div>
        <div className="form-grid">
          <label>
            Merchant
            <input
              required
              maxLength={120}
              value={fields.merchant}
              onChange={(e) => field("merchant", e.target.value)}
              placeholder="e.g. The Oberoi Bengaluru"
            />
          </label>
          <label>
            Category
            <select
              value={fields.category}
              onChange={(e) => field("category", e.target.value)}
            >
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Total amount
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+([.][0-9]{1,2})?"
              value={fields.amount}
              onChange={(e) => field("amount", e.target.value)}
              placeholder="0.00"
            />
          </label>
          <label>
            Currency
            <select
              value={fields.currency}
              onChange={(e) => field("currency", e.target.value)}
            >
              {["INR", "USD", "EUR", "GBP", "SGD", "AED"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Transaction date
            <input
              required
              type="date"
              value={fields.date}
              onChange={(e) => field("date", e.target.value)}
            />
          </label>
          <label>
            Tax included
            <input
              inputMode="decimal"
              value={fields.tax}
              onChange={(e) => field("tax", e.target.value)}
            />
          </label>
          <label>
            Receipt number
            <input
              value={fields.receiptNumber}
              onChange={(e) => field("receiptNumber", e.target.value)}
            />
          </label>
          <label>
            Business trip
            <select
              value={fields.tripId}
              onChange={(e) => field("tripId", e.target.value)}
            >
              <option value="">No associated trip</option>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {fields.category === "Accommodation" && (
            <label>
              Number of nights
              <input
                type="number"
                min="1"
                max="365"
                value={fields.nights}
                onChange={(e) => field("nights", Number(e.target.value))}
              />
            </label>
          )}
          {fields.category === "Flights" && (
            <label>
              Cabin class
              <select
                value={fields.cabin}
                onChange={(e) => field("cabin", e.target.value)}
              >
                {["Unknown", "Economy", "Business", "First"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          )}
          <label className="full">
            Business purpose
            <textarea
              required
              minLength={3}
              value={fields.purpose}
              onChange={(e) => field("purpose", e.target.value)}
              placeholder="What was this expense for?"
            />
          </label>
        </div>
        <div className="notice">
          Saving creates a reviewed draft expense. Group drafts into a claim and
          review the calculation before submitting.
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-footer">
          <span className="muted">
            Policy checks run using your reviewed values.
          </span>
          <button className="primary" disabled={busy}>
            {busy ? "Please wait…" : "Save draft expense →"}
          </button>
        </div>
      </form>
    </div>
  );
}
