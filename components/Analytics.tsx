"use client";
import { useEffect, useState } from "react";
import type { analytics } from "@/lib/claimpilot/analytics";
import { Empty, money, request } from "./ui";
type Data = ReturnType<typeof analytics>;
export default function Analytics() {
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-12-31");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setError("");
    request(`/api/analytics?from=${from}&to=${to}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [from, to]);
  return (
    <>
      <div className="filter-bar">
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <span className="muted">
          Expenses by transaction date · Claims by creation date · Payments by
          recorded date
        </span>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data ? (
        <div className="skeleton" />
      ) : (
        <>
          <div className="stats-grid">
            {[
              ["Submitted expenses", data.total],
              ["Approved eligibility", data.approved],
              ["Recorded reimbursements", data.reimbursed],
              ["Awaiting reimbursement", data.pending],
            ].map(([title, totals]) => (
              <div className="stat-card" key={String(title)}>
                <span>{String(title)}</span>
                <strong>
                  {Object.entries(totals)
                    .map(([cur, n]) => money(n, cur))
                    .join(" · ") || "—"}
                </strong>
                <small>Original currencies · No conversions</small>
              </div>
            ))}
          </div>
          <div className="analytics-grid">
            <Bars title="Department expenditure" groups={data.byDepartment} />
            <Bars title="Expense category breakdown" groups={data.byCategory} />
            <Bars title="Monthly spending" groups={data.monthly} />
            <section className="panel">
              <div className="section-heading">
                <h3>Review operations</h3>
                <span className="tiny-label">SELECTED PERIOD</span>
              </div>
              {[
                ["Claims awaiting approval", data.claimsAwaitingApproval],
                ["Policy exception signals", data.policyExceptions],
                ["Potential duplicate signals", data.potentialDuplicates],
                ["High-risk claims", data.highRisk],
                [
                  "Average approval time",
                  data.averageApprovalHours === null
                    ? "No completed approvals"
                    : `${data.averageApprovalHours.toFixed(1)} hours`,
                ],
              ].map(([label, v]) => (
                <div className="operation-row" key={label}>
                  <span>{label}</span>
                  <strong>{v}</strong>
                </div>
              ))}
              <p className="muted intro-text">
                Signal counts may include both sides of a duplicate match.
                Actual recorded reimbursement totals come from payment records.
              </p>
            </section>
          </div>
        </>
      )}
    </>
  );
}
export function Bars({
  title,
  groups,
}: {
  title: string;
  groups: Record<string, Record<string, number>>;
}) {
  const currencies = Array.from(
    new Set(Object.values(groups).flatMap((v) => Object.keys(v))),
  );
  return (
    <section className="panel bar-chart">
      <div className="section-heading">
        <h3>{title}</h3>
        <span className="tiny-label">ORIGINAL CURRENCY</span>
      </div>
      {!currencies.length && <Empty title="No expenses in this period" />}
      {currencies.map((cur) => {
        const max = Math.max(
          1,
          ...Object.values(groups).map((v) => v[cur] || 0),
        );
        return (
          <div key={cur} className="currency-chart">
            <span className="chart-currency">{cur}</span>
            {Object.entries(groups)
              .sort(([a], [b]) => a.localeCompare(b))
              .filter(([, v]) => v[cur])
              .map(([key, v], i) => (
                <div className="bar-row" key={key}>
                  <div>
                    <span>{key}</span>
                    <b>{money(v[cur], cur)}</b>
                  </div>
                  <div className="bar-track">
                    <i
                      className={`bar-${i % 4}`}
                      style={{ width: `${(v[cur] / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </section>
  );
}
