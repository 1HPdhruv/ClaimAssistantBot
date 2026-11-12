"use client";
import { useState } from "react";
import type {
  Claim,
  Profile,
  Expense,
  State,
  Finding,
} from "@/lib/claimpilot/types";
import type { calculate, investigate } from "@/lib/claimpilot/engine";
import { Badge, Icon, money, request, human } from "./ui";
export type Evaluation = ReturnType<typeof investigate> & {
  claimId: string;
  calculation: ReturnType<typeof calculate>;
};
export default function ClaimDetail({
  claim,
  actor,
  expenses,
  profiles,
  evaluation,
  audits,
  onChanged,
  onClose,
}: {
  claim: Claim;
  actor: Profile;
  expenses: Expense[];
  profiles: Profile[];
  evaluation: Evaluation;
  audits: State["audits"];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState("");
  const [internal, setInternal] = useState(false);
  const [exception, setException] = useState(false);
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState("");
  const owner = profiles.find((p) => p.id === claim.employeeId);
  async function action(status: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/api/workspace/claims/${claim.id}`, "PATCH", {
        status,
        comment,
        exceptionApproved: exception && status === "APPROVED",
        paymentReference: reference,
        paymentDate: date,
      });
      setPending("");
      setComment("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addComment() {
    setBusy(true);
    setError("");
    try {
      await request(`/api/workspace/comments/${claim.id}`, "PATCH", {
        comment,
        internal,
      });
      setComment("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const actions =
    actor.id === claim.employeeId
      ? ["DRAFT", "NEEDS_INFORMATION"].includes(claim.status)
        ? ["SUBMITTED"]
        : []
      : actor.role === "manager" &&
          ["SUBMITTED", "UNDER_REVIEW"].includes(claim.status)
        ? ["UNDER_REVIEW", "APPROVED", "NEEDS_INFORMATION", "REJECTED"]
        : actor.role === "finance"
          ? claim.status === "APPROVED"
            ? ["FINANCE_VERIFICATION"]
            : claim.status === "FINANCE_VERIFICATION"
              ? ["REIMBURSEMENT_PROCESSING", "NEEDS_INFORMATION"]
              : claim.status === "REIMBURSEMENT_PROCESSING"
                ? ["REIMBURSED"]
                : []
          : [];
  return (
    <div className="detail">
      <button className="text-button" onClick={onClose}>
        ← Back to workspace
      </button>
      <div className="page-title">
        <div>
          <span className="eyebrow">{claim.reference}</span>
          <h1>{claim.title}</h1>
          <p>
            {owner?.name} <span className="dot-separator">·</span>{" "}
            {owner?.department} <span className="dot-separator">·</span>{" "}
            Submitted {claim.createdAt.slice(0, 10)}
          </p>
        </div>
        <Badge value={claim.status} />
      </div>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <div className="section-heading">
              <h3>Expense evidence</h3>
              <span className="muted">{expenses.length} transactions</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Merchant / category</th>
                    <th>Date</th>
                    <th>Document</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.merchant}</strong>
                        <small>{e.category}</small>
                        <small>
                          {e.receiptNumber || "No receipt reference"}
                        </small>
                      </td>
                      <td>{e.date}</td>
                      <td>
                        {e.receiptId ? (
                          <a
                            className="document-link"
                            href={`/api/receipts/${e.receiptId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View evidence ↗
                          </a>
                        ) : (
                          <Badge value="Missing" />
                        )}
                      </td>
                      <td className="right amount">
                        {money(e.amountMinor, e.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel findings-panel">
            <div className="section-heading">
              <h3>
                <Icon name="investigations" /> Investigation findings
              </h3>
              <span className="tiny-label">DETERMINISTIC CHECKS</span>
            </div>
            <p className="muted intro-text">
              Each signal links to transaction evidence. Flags require human
              review and do not establish fraud.
            </p>
            {!evaluation.findings.length && (
              <p className="success">No findings from the configured checks.</p>
            )}
            {evaluation.findings.map((f: Finding, i) => (
              <article className="finding" key={`${f.id}:${i}`}>
                <div className={`finding-mark ${f.severity.toLowerCase()}`}>
                  !
                </div>
                <div>
                  <div className="finding-title">
                    <strong>{f.rule}</strong>
                    <Badge value={f.severity} />
                  </div>
                  <p>{f.explanation}</p>
                  <dl>
                    <div>
                      <dt>Observed</dt>
                      <dd>{f.observed}</dd>
                    </div>
                    <div>
                      <dt>Expected</dt>
                      <dd>{f.expected}</dd>
                    </div>
                  </dl>
                  <small>
                    Expense:{" "}
                    {expenses.find((e) => e.id === f.expenseId)?.merchant} ·{" "}
                    {f.expenseId.slice(-8)} · Weight +{f.weight}
                  </small>
                  {f.relatedIds.map((id) => (
                    <small key={id}>Related transaction: {id}</small>
                  ))}
                  <div className="finding-action">↳ {f.action}</div>
                  <small>
                    Evaluated {new Date(f.evaluatedAt).toLocaleString("en-IN")}
                  </small>
                </div>
              </article>
            ))}
          </section>
          <section className="panel">
            <div className="section-heading">
              <h3>Activity & review history</h3>
              <Icon name="claims" />
            </div>
            <div className="timeline">
              {audits
                .filter(
                  (a) =>
                    a.entityId === claim.id &&
                    !a.action.startsWith("AI_CONFIRMATION"),
                )
                .slice()
                .reverse()
                .map((a) => (
                  <div key={a.id}>
                    <span className="timeline-dot" />
                    <strong>{human(a.action)}</strong>
                    <small>
                      {profiles.find((p) => p.id === a.actorId)?.name ||
                        "Authorized reviewer"}{" "}
                      · {new Date(a.at).toLocaleString("en-IN")}
                    </small>
                    {a.internal && <Badge value="Internal" />}
                    {a.comment && <p>{a.comment}</p>}
                  </div>
                ))}
            </div>
          </section>
        </div>
        <aside>
          <section className="panel risk-panel">
            <span className="eyebrow">INVESTIGATION SIGNAL</span>
            <div className="risk-score">
              <strong>{evaluation.score}</strong>
              <span>/ 100</span>
              <Badge value={evaluation.level} />
            </div>
            <div className="risk-meter">
              <i style={{ width: `${evaluation.score}%` }} />
            </div>
            <p className="muted">{evaluation.explanation}</p>
            <div className="risk-weights">
              {evaluation.findings.map((f, i) => (
                <div key={i}>
                  <span>{human(f.type)}</span>
                  <b>+{f.weight}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="panel calculation">
            <h3>Reimbursement calculation</h3>
            {Object.entries(evaluation.calculation.totals).map(([cur, t]) => (
              <div key={cur}>
                <div className="calc-line">
                  <span>Submitted · {cur}</span>
                  <strong>{money(t.submitted, cur)}</strong>
                </div>
                <div className="calc-line">
                  <span>Potential excess / held</span>
                  <strong>{money(t.excess, cur)}</strong>
                </div>
                <div className="calc-total">
                  <span>Policy eligible</span>
                  <strong>{money(t.eligible, cur)}</strong>
                </div>
                <div className="calc-line">
                  <span>Approved amount</span>
                  <strong>
                    {t.approved === null
                      ? "Awaiting decision"
                      : money(t.approved, cur)}
                  </strong>
                </div>
                <p className="muted">
                  {claim.exceptionApproved
                    ? "Includes documented manager exception."
                    : "Subject to approval. Missing documents and absent currency policies are held for review."}
                </p>
              </div>
            ))}
            <details>
              <summary>How this was calculated</summary>
              {evaluation.calculation.lines.map((l) => (
                <p className="muted" key={l.expenseId}>
                  {expenses.find((e) => e.id === l.expenseId)?.merchant}:{" "}
                  {money(l.eligible, l.currency)} · {l.reason}
                </p>
              ))}
            </details>
            {claim.paymentReference && (
              <div className="notice">
                Recorded payment reference: {claim.paymentReference}
                <br />
                {claim.paymentDate} · No money transferred by ClaimPilot.
              </div>
            )}
          </section>
          <section className="panel review-panel">
            <h3>{actions.length ? "Review & next step" : "Discussion"}</h3>
            {claim.exceptionReason && (
              <p className="notice">
                Employee justification: {claim.exceptionReason}
              </p>
            )}
            <label>
              Review comment / clarification
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add context for the next reviewer…"
              />
            </label>
            {actor.role === "manager" && actions.includes("APPROVED") && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={exception}
                  onChange={(e) => setException(e.target.checked)}
                />
                Approve documented exception for the full submitted amount
              </label>
            )}
            {actions.includes("REIMBURSED") && (
              <>
                <label>
                  Recorded payment reference
                  <input
                    required
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. NEFT-2026-0142"
                  />
                </label>
                <label>
                  Payment date
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <p className="muted">
                  This records a reimbursement; it does not initiate a payment.
                </p>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {actor.role !== "employee" && (
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(e) => setInternal(e.target.checked)}
                />
                Internal note (visible only to authorized reviewers; applies to
                Add comment)
              </label>
            )}
            <div className="review-actions">
              {actions.map((s) => (
                <button
                  disabled={busy}
                  className={
                    s === "REJECTED"
                      ? "danger"
                      : s === "NEEDS_INFORMATION"
                        ? "secondary"
                        : "primary"
                  }
                  key={s}
                  onClick={() => setPending(s)}
                >
                  {s === "SUBMITTED"
                    ? "Submit claim"
                    : s === "APPROVED"
                      ? "Approve claim"
                      : s === "REIMBURSED"
                        ? "Record reimbursement"
                        : human(s)}
                </button>
              ))}
              <button
                className="secondary"
                disabled={busy || comment.trim().length < 2}
                onClick={addComment}
              >
                Add comment
              </button>
            </div>
            {pending && (
              <div className="confirm-box">
                <strong>Confirm: {human(pending)}</strong>
                <p>This will update the claim and create an audit record.</p>
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() => action(pending)}
                >
                  {busy ? "Saving…" : "Confirm action"}
                </button>
                <button className="text-button" onClick={() => setPending("")}>
                  Cancel
                </button>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
