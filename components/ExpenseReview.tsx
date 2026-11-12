"use client";
import { useEffect, useRef } from "react";
import type { Expense } from "@/lib/claimpilot/types";
import type { Evaluation } from "./ClaimDetail";
import { Badge, money } from "./ui";
export default function ExpenseReview({
  expense,
  result,
  onClose,
}: {
  expense: Expense;
  result: Omit<Evaluation, "claimId">;
  onClose: () => void;
}) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-overlay"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <section
        className="panel modal"
        role="dialog"
        aria-modal="true"
        aria-label="Expense policy review"
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">EXPENSE POLICY REVIEW</span>
            <h2>{expense.merchant}</h2>
          </div>
          <button
            ref={close}
            className="text-button"
            aria-label="Close expense review"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="operation-row">
          <span>
            {expense.category} · {expense.date}
          </span>
          <strong>{money(expense.amountMinor, expense.currency)}</strong>
        </div>
        <p className="muted intro-text">{expense.purpose}</p>
        {expense.receiptId && (
          <a
            className="document-link"
            href={`/api/receipts/${expense.receiptId}`}
            target="_blank"
            rel="noreferrer"
          >
            Inspect original evidence ↗
          </a>
        )}
        <div className="calc-total">
          <span>Standard policy eligibility</span>
          <strong>
            {money(
              result.calculation.lines[0]?.eligible || 0,
              expense.currency,
            )}
          </strong>
        </div>
        <p className="notice">
          Eligibility is a calculation, not approval. Duplicate and context
          signals require human review.
        </p>
        {result.findings.length ? (
          result.findings.map((f, i) => (
            <article className="expense-finding" key={i}>
              <div className="finding-title">
                <strong>{f.rule}</strong>
                <Badge value={f.severity} />
              </div>
              <p>{f.explanation}</p>
              <small>
                Observed: {f.observed}
                <br />
                Expected: {f.expected}
              </small>
              <p className="finding-action">↳ {f.action}</p>
              {f.relatedIds.map((id) => (
                <small key={id}>Related expense: {id}</small>
              ))}
            </article>
          ))
        ) : (
          <p className="success intro-text">
            No findings from the configured checks.
          </p>
        )}
      </section>
    </div>
  );
}
