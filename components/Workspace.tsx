"use client";
import { toMinor } from "@/lib/claimpilot/schemas";
import { useCallback, useEffect, useState } from "react";
import type {
  Claim,
  Expense,
  Profile,
  State,
  Policy,
} from "@/lib/claimpilot/types";
import { statuses } from "@/lib/claimpilot/types";
import { Badge, Empty, Icon, money, request, human } from "./ui";
import ExpenseForm from "./ExpenseForm";
import ClaimDetail, { type Evaluation } from "./ClaimDetail";
import ExpenseReview from "./ExpenseReview";
import Copilot from "./Copilot";
import Analytics, { Bars } from "./Analytics";
type Data = Omit<State, "receipts"> & {
  actor: Profile;
  mode: string;
  aiConfigured: boolean;
  receipts: Omit<State["receipts"][number], "path" | "hash">[];
  evaluations: Evaluation[];
  expenseEvaluations: Record<string, Omit<Evaluation, "claimId">>;
};
const menu = [
  ["Overview", "overview"],
  ["My Expenses", "expenses"],
  ["Submit Claim", "upload"],
  ["My Claims", "claims"],
  ["Business Trips", "trips"],
  ["Approvals", "approvals"],
  ["Investigations", "investigations"],
  ["Policies", "policies"],
  ["Finance Analytics", "analytics"],
  ["AI Copilot", "copilot"],
  ["Settings", "settings"],
];
const descriptions: Record<string, string> = {
  Overview: "A clear view of your expenses, claims and what needs attention.",
  "My Expenses":
    "Every transaction, organized. Review drafts before building your claim.",
  "Submit Claim": "From receipt to reviewed expense in a few simple steps.",
  "My Claims": "Follow every claim from submission to recorded reimbursement.",
  "Business Trips": "Keep your travel context connected to every expense.",
  Approvals: "Make informed decisions with the complete picture.",
  Investigations: "Connect the evidence. Understand the exception.",
  Policies:
    "Clear allowances. Consistent decisions. Human-reviewed exceptions.",
  "Finance Analytics":
    "An honest picture of organizational spend, in every original currency.",
  "AI Copilot": "Your intelligent expense claim & reimbursement copilot.",
  Settings: "Your workspace identity and connected services.",
};
export default function Workspace() {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState("Overview");
  const [selected, setSelected] = useState("");
  const [reviewExpense, setReviewExpense] = useState<Expense | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Expense | undefined>();
  const [mobile, setMobile] = useState(false);
  const [claimBuilder, setClaimBuilder] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [claimTitle, setClaimTitle] = useState("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    try {
      setData(await request("/api/workspace"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  useEffect(() => {
    const key = location.hash.slice(1);
    const found = menu.find(
      ([label]) => label.toLowerCase().replaceAll(" ", "-") === key,
    );
    if (found) setPage(found[0]);
  }, []);
  function navigate(p: string) {
    setPage(p);
    setSelected("");
    setSearch("");
    setStatus("all");
    setEditing(undefined);
    setMobile(false);
    location.hash = p.toLowerCase().replaceAll(" ", "-");
  }
  async function logout() {
    await request("/api/logout", "POST");
    location.href = "/login";
  }
  async function remove(e: Expense) {
    setBusy(true);
    try {
      await request(`/api/workspace/expenses/${e.id}`, "DELETE");
      setNotice("Draft expense deleted.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function buildClaim(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await request("/api/workspace/claims", "POST", {
        title: claimTitle,
        expenseIds: chosen,
        exceptionReason: justification,
      });
      setClaimBuilder(false);
      setChosen([]);
      setClaimTitle("");
      await reload();
      navigate("My Claims");
      setSelected(c.id);
      setNotice(
        "Draft claim created. Review the calculation before submitting.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <main className="loading-screen">
        <span className="brand-icon">↗</span>
        <h2>Opening ClaimPilot</h2>
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <a href="/login">Return to sign in</a>
            <button className="secondary" onClick={reload}>
              Retry
            </button>
          </>
        ) : (
          <div className="skeleton" />
        )}
      </main>
    );
  const actor = data.actor;
  const own = data.expenses.filter((e) => e.employeeId === actor.id);
  const ownClaims = data.claims.filter((c) => c.employeeId === actor.id);
  const myDrafts = own.filter((e) => e.status === "draft");
  const visibleMenu = menu.filter(
    ([p]) =>
      (p !== "Approvals" || actor.role !== "employee") &&
      (p !== "Finance Analytics" || actor.role === "finance"),
  );
  const claimsForPage =
    page === "My Claims"
      ? ownClaims
      : page === "Approvals"
        ? data.claims.filter((c) =>
            actor.role === "manager"
              ? [
                  "SUBMITTED",
                  "UNDER_REVIEW",
                  "NEEDS_INFORMATION",
                  "APPROVED",
                  "REJECTED",
                ].includes(c.status)
              : [
                  "APPROVED",
                  "FINANCE_VERIFICATION",
                  "REIMBURSEMENT_PROCESSING",
                  "REIMBURSED",
                ].includes(c.status),
          )
        : data.claims;
  const activeClaim = data.claims.find((c) => c.id === selected);
  const evaluation = data.evaluations.find((e) => e.claimId === selected);
  const filtered = claimsForPage.filter(
    (c) =>
      (status === "all" || c.status === status) &&
      `${c.title} ${c.reference} ${data.profiles.find((p) => p.id === c.employeeId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function claimTable(claims: Claim[], compact = false) {
    const d = data;
    if (!d) return null;
    return claims.length ? (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Claim / business purpose</th>
              {!compact && <th>Employee</th>}
              <th>Submitted</th>
              <th>Status</th>
              <th className="right">Amount</th>
              <th aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => {
              const sums: Record<string, number> = {};
              d.expenses
                .filter((e) => c.expenseIds.includes(e.id))
                .forEach(
                  (e) =>
                    (sums[e.currency] =
                      (sums[e.currency] || 0) + e.amountMinor),
                );
              return (
                <tr
                  key={c.id}
                  className="clickable"
                  onClick={() => setSelected(c.id)}
                >
                  <td>
                    <button
                      className="table-title"
                      onClick={() => setSelected(c.id)}
                    >
                      {c.title}
                    </button>
                    <small>
                      {c.reference} · {c.expenseIds.length} expenses
                    </small>
                  </td>
                  {!compact && (
                    <td>
                      <div className="person-cell">
                        <span className="avatar small">
                          {d.profiles
                            .find((p) => p.id === c.employeeId)
                            ?.name.split(" ")
                            .map((s) => s[0])
                            .join("")}
                        </span>
                        {d.profiles.find((p) => p.id === c.employeeId)?.name}
                      </div>
                    </td>
                  )}
                  <td>{c.createdAt.slice(0, 10)}</td>
                  <td>
                    <Badge value={c.status} />
                  </td>
                  <td className="right amount">
                    {Object.entries(sums).map(([cur, n]) => (
                      <div key={cur}>{money(n, cur)}</div>
                    ))}
                  </td>
                  <td>
                    <Icon name="arrow" size={16} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty title="No matching claims">
        Create a claim from reviewed draft expenses, or adjust your filters.
      </Empty>
    );
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          href="/#overview"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            navigate("Overview");
          }}
        >
          <span className="brand-icon">↗</span>ClaimPilot
          <span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="company-icon">A</span>
          <div>
            <strong>Acme Corporation</strong>
            <small>Fictional demo workspace</small>
          </div>
          <span>⌄</span>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {visibleMenu.slice(0, -1).map(([label, icon], i) => (
            <button
              className={page === label ? "active" : ""}
              key={label}
              aria-label={label}
              onClick={() => navigate(label)}
            >
              <Icon name={icon} />
              <span>{label}</span>
              {label === "Approvals" && (
                <b className="nav-count">
                  {
                    data.claims.filter((c) =>
                      ["SUBMITTED", "UNDER_REVIEW"].includes(c.status),
                    ).length
                  }
                </b>
              )}
              {label === "AI Copilot" && <span className="new-tag">AI</span>}
              {i === 3 && null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="investigations" />
            <strong>Clarity at every step.</strong>
            <p>
              Evidence-based insights.
              <br />
              Human-led decisions.
            </p>
          </div>
          <button
            className={
              page === "Settings" ? "settings-link active" : "settings-link"
            }
            onClick={() => navigate("Settings")}
          >
            <Icon name="settings" />
            Settings
          </button>
          <div className="user-card">
            <span className="avatar">
              {actor.name
                .split(" ")
                .map((s) => s[0])
                .join("")}
            </span>
            <div>
              <strong>{actor.name}</strong>
              <small>{human(actor.role)} workspace</small>
            </div>
            <button aria-label="Sign out" onClick={logout}>
              <Icon name="logout" size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() => setMobile(!mobile)}
          >
            ☰
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-chip">
              <i /> {data.mode} · fictional data
            </span>
            <span className="top-date">
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Kolkata",
              })}
            </span>
            <span className="avatar small">
              {actor.name
                .split(" ")
                .map((s) => s[0])
                .join("")}
            </span>
          </div>
        </header>
        <main className="workspace-main">
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                ×
              </button>
            </div>
          )}
          {notice && (
            <div className="notice banner" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          {activeClaim && evaluation ? (
            <ClaimDetail
              key={activeClaim.id}
              claim={activeClaim}
              actor={actor}
              expenses={data.expenses.filter((e) =>
                activeClaim.expenseIds.includes(e.id),
              )}
              profiles={data.profiles}
              evaluation={evaluation}
              audits={data.audits}
              onChanged={reload}
              onClose={() => setSelected("")}
            />
          ) : (
            <>
              <div className="page-title">
                <div>
                  <span className="eyebrow">
                    {page === "Overview"
                      ? "YOUR WORKSPACE, AT A GLANCE"
                      : "CLAIMPILOT WORKSPACE"}
                  </span>
                  <h1>
                    {page === "Overview"
                      ? `Good ${Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date())) < 12 ? "morning" : "afternoon"}, ${actor.name.split(" ")[0]}.`
                      : page}
                  </h1>
                  <p>{descriptions[page]}</p>
                </div>
                <div className="title-actions">
                  {page === "Overview" && (
                    <button
                      className="secondary"
                      onClick={() => navigate("AI Copilot")}
                    >
                      <Icon name="copilot" size={17} />
                      Ask copilot
                    </button>
                  )}
                  {["Overview", "My Expenses", "My Claims"].includes(page) && (
                    <button
                      className="primary"
                      onClick={() => navigate("Submit Claim")}
                    >
                      <span>＋</span> New expense
                    </button>
                  )}
                </div>
              </div>
              {page === "Overview" && (
                <>
                  <Overview
                    data={data}
                    setSelected={setSelected}
                    navigate={navigate}
                  />
                  <div className="overview-grid">
                    <section className="panel recent-claims">
                      <div className="section-heading">
                        <div>
                          <h3>
                            {actor.role === "employee"
                              ? "Your recent claims"
                              : "Recent team claims"}
                          </h3>
                          <p className="muted">Every claim, one step closer.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() =>
                            navigate(
                              actor.role === "employee"
                                ? "My Claims"
                                : "Approvals",
                            )
                          }
                        >
                          View all <span>↗</span>
                        </button>
                      </div>
                      {claimTable(
                        (actor.role === "employee"
                          ? ownClaims
                          : data.claims
                        ).slice(0, 5),
                        true,
                      )}
                    </section>
                    <section className="panel attention-panel">
                      <div className="section-heading">
                        <h3>Needs attention</h3>
                        <span className="attention-dot" />
                      </div>
                      {data.evaluations
                        .filter((e) => e.findings.length > 0)
                        .slice(0, 3)
                        .map((e) => (
                          <button
                            key={e.claimId}
                            className="attention-item"
                            onClick={() => setSelected(e.claimId)}
                          >
                            <span className="attention-icon">
                              <Icon name="investigations" size={18} />
                            </span>
                            <span>
                              <strong>
                                {
                                  data.claims.find((c) => c.id === e.claimId)
                                    ?.reference
                                }
                              </strong>
                              <small>
                                {e.findings.length} findings ·{" "}
                                {e.level.toLowerCase()} review signal
                              </small>
                            </span>
                            <span>↗</span>
                          </button>
                        ))}
                      <div className="attention-footnote">
                        <Icon name="approvals" size={16} />
                        Flags guide review. People make decisions.
                      </div>
                    </section>
                  </div>
                </>
              )}
              {page === "Submit Claim" && (
                <ExpenseForm
                  key={editing?.id || "new"}
                  expense={editing}
                  trips={data.trips.filter((t) => t.employeeId === actor.id)}
                  onSaved={() => {
                    reload();
                    navigate("My Expenses");
                    setNotice("Draft saved. Review it and add it to a claim.");
                  }}
                />
              )}
              {page === "My Expenses" && (
                <>
                  <div className="filter-bar">
                    <div className="search-field">
                      <Icon name="search" size={17} />
                      <input
                        aria-label="Search expenses"
                        placeholder="Search merchant or category…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Expense status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All expenses</option>
                      <option value="draft">Draft</option>
                      <option value="claimed">Claimed</option>
                    </select>
                    <button
                      className="primary push-right"
                      disabled={!myDrafts.length}
                      onClick={() => {
                        setChosen([]);
                        setClaimBuilder(true);
                      }}
                    >
                      Create claim from drafts
                    </button>
                  </div>
                  <section className="panel">
                    {own.filter(
                      (e) =>
                        (status === "all" || e.status === status) &&
                        `${e.merchant} ${e.category}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                    ).length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Merchant / purpose</th>
                              <th>Category</th>
                              <th>Date</th>
                              <th>Status</th>
                              <th className="right">Amount</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {own
                              .filter(
                                (e) =>
                                  (status === "all" || e.status === status) &&
                                  `${e.merchant} ${e.category}`
                                    .toLowerCase()
                                    .includes(search.toLowerCase()),
                              )
                              .map((e) => (
                                <tr key={e.id}>
                                  <td>
                                    <strong>{e.merchant}</strong>
                                    <small>{e.purpose}</small>
                                    {e.receiptId && (
                                      <a
                                        href={`/api/receipts/${e.receiptId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="document-link"
                                      >
                                        Receipt ↗
                                      </a>
                                    )}
                                  </td>
                                  <td>{e.category}</td>
                                  <td>{e.date}</td>
                                  <td>
                                    <Badge value={e.status} />
                                  </td>
                                  <td className="right amount">
                                    {money(e.amountMinor, e.currency)}
                                  </td>
                                  <td>
                                    <button
                                      className="text-button"
                                      onClick={() => setReviewExpense(e)}
                                    >
                                      Review checks
                                    </button>
                                    <br />
                                    {e.status === "draft" ||
                                    data.claims.some(
                                      (c) =>
                                        c.expenseIds.includes(e.id) &&
                                        ["DRAFT", "NEEDS_INFORMATION"].includes(
                                          c.status,
                                        ),
                                    ) ? (
                                      <div className="inline-actions">
                                        <button
                                          className="text-button"
                                          onClick={() => {
                                            navigate("Submit Claim");
                                            setEditing(e);
                                          }}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          className="text-button red-text"
                                          disabled={
                                            busy || e.status !== "draft"
                                          }
                                          onClick={() => remove(e)}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        className="text-button"
                                        onClick={() =>
                                          setSelected(
                                            data.claims.find((c) =>
                                              c.expenseIds.includes(e.id),
                                            )?.id || "",
                                          )
                                        }
                                      >
                                        View claim ↗
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty title="No matching expenses">
                        Add your first receipt or enter an expense manually.
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {["My Claims", "Approvals"].includes(page) && (
                <>
                  <div className="filter-bar">
                    <div className="search-field">
                      <Icon name="search" size={17} />
                      <input
                        aria-label="Search claims"
                        placeholder="Search claims or employees…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Claim status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {statuses.map((s) => (
                        <option value={s} key={s}>
                          {human(s)}
                        </option>
                      ))}
                    </select>
                    <span className="muted">{filtered.length} claims</span>
                  </div>
                  <section className="panel">{claimTable(filtered)}</section>
                </>
              )}
              {page === "Business Trips" && (
                <Trips
                  data={data}
                  onSaved={() => {
                    reload();
                    setNotice("Business trip created.");
                  }}
                />
              )}
              {page === "Investigations" && (
                <>
                  <div className="investigation-intro">
                    <span className="copilot-avatar">
                      <Icon name="investigations" size={26} />
                    </span>
                    <div>
                      <strong>
                        Follow the evidence, from receipt to resolution.
                      </strong>
                      <p>
                        Policy exceptions, duplicate matches and contextual
                        checks — with the records behind every signal.
                      </p>
                    </div>
                    <span className="tiny-label">HUMAN REVIEW REQUIRED</span>
                  </div>
                  <div className="filter-bar">
                    <div className="search-field">
                      <Icon name="search" size={17} />
                      <input
                        aria-label="Search investigations"
                        placeholder="Search claim reference or business purpose…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Risk level"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="all">All risk levels</option>
                      {["Critical", "High", "Medium", "Low"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="investigation-list">
                    {data.evaluations
                      .filter((e) => {
                        const c = data.claims.find((c) => c.id === e.claimId)!;
                        return (
                          (status === "all" || status === e.level) &&
                          `${c.title} ${c.reference}`
                            .toLowerCase()
                            .includes(search.toLowerCase())
                        );
                      })
                      .map((e) => {
                        const c = data.claims.find((c) => c.id === e.claimId)!;
                        return (
                          <button
                            className="panel investigation-card"
                            key={e.claimId}
                            onClick={() => setSelected(e.claimId)}
                          >
                            <div className="investigation-card-top">
                              <span className="tiny-label">{c.reference}</span>
                              <Badge value={e.level} />
                            </div>
                            <h3>{c.title}</h3>
                            <p>
                              {
                                data.profiles.find((p) => p.id === c.employeeId)
                                  ?.name
                              }{" "}
                              · {c.expenseIds.length} transactions
                            </p>
                            <div className="risk-meter">
                              <i style={{ width: `${e.score}%` }} />
                            </div>
                            <div className="investigation-card-bottom">
                              <span>
                                <strong>{e.score}</strong> / 100 signal score
                              </span>
                              <span>
                                {e.findings.length} findings <span>↗</span>
                              </span>
                            </div>
                            <div className="signal-tags">
                              {Array.from(
                                new Set(e.findings.map((f) => f.type)),
                              )
                                .slice(0, 3)
                                .map((t) => (
                                  <span key={t}>{human(t)}</span>
                                ))}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                </>
              )}
              {page === "Policies" && (
                <Policies
                  policies={data.policies}
                  actor={actor}
                  onSaved={() => {
                    reload();
                    setNotice("Policy updated and audit record saved.");
                  }}
                />
              )}
              {page === "Finance Analytics" && actor.role === "finance" && (
                <Analytics />
              )}
              {page === "AI Copilot" && (
                <Copilot configured={data.aiConfigured} onChanged={reload} />
              )}
              {page === "Settings" && (
                <div className="settings-grid">
                  <section className="panel settings-panel">
                    <h3>Your demo identity</h3>
                    <div className="settings-person">
                      <span className="avatar large">
                        {actor.name
                          .split(" ")
                          .map((s) => s[0])
                          .join("")}
                      </span>
                      <div>
                        <h2>{actor.name}</h2>
                        <p>
                          {actor.department} · {human(actor.role)}
                        </p>
                      </div>
                    </div>
                    <p className="muted">
                      Your identity and role are bound to a signed, expiring
                      HTTP-only session. To explore another role, sign out and
                      choose a different demo account.
                    </p>
                    <button className="secondary" onClick={logout}>
                      Sign out & switch workspace
                    </button>
                  </section>
                  <section className="panel settings-panel">
                    <h3>Connected services</h3>
                    <div className="operation-row">
                      <span>Data persistence</span>
                      <strong>{data.mode}</strong>
                    </div>
                    <div className="operation-row">
                      <span>Receipt intelligence</span>
                      <Badge
                        value={data.aiConfigured ? "Configured" : "Unavailable"}
                      />
                    </div>
                    <div className="operation-row">
                      <span>Reimbursements</span>
                      <strong>Record keeping only</strong>
                    </div>
                    <div className="notice">
                      All accounts, policies and seeded transactions are
                      fictional. Local demo state is stored on this server.
                      Hosted deployments should use designated development
                      Supabase storage.
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              ClaimPilot <span className="muted">/</span> Less paperwork. More
              perspective.
            </span>
            <span>
              <i /> All demo records are fictional
            </span>
          </footer>
        </main>
      </div>
      {reviewExpense && (
        <ExpenseReview
          expense={reviewExpense}
          result={data.expenseEvaluations[reviewExpense.id]}
          onClose={() => setReviewExpense(null)}
        />
      )}
      {claimBuilder && (
        <div className="modal-overlay">
          <form className="modal panel" onSubmit={buildClaim}>
            <div className="section-heading">
              <h2>Prepare your claim</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => setClaimBuilder(false)}
                aria-label="Close claim builder"
              >
                ×
              </button>
            </div>
            <label>
              Claim title
              <input
                required
                minLength={3}
                maxLength={120}
                placeholder="e.g. Bengaluru client visit"
                value={claimTitle}
                onChange={(e) => setClaimTitle(e.target.value)}
              />
            </label>
            <p className="muted">Select reviewed, unclaimed draft expenses.</p>
            <div className="draft-choices">
              {myDrafts.map((e) => (
                <label key={e.id} className="draft-choice">
                  <input
                    type="checkbox"
                    checked={chosen.includes(e.id)}
                    onChange={(ev) =>
                      setChosen(
                        ev.target.checked
                          ? [...chosen, e.id]
                          : chosen.filter((id) => id !== e.id),
                      )
                    }
                  />
                  <span>
                    <strong>{e.merchant}</strong>
                    <small>
                      {e.date} · {e.category}
                    </small>
                  </span>
                  <b>{money(e.amountMinor, e.currency)}</b>
                </label>
              ))}
            </div>
            <label>
              Exception justification (optional)
              <textarea
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Explain any business need for an exception…"
              />
            </label>
            <div className="notice">
              This creates a draft. Review policy findings and currency-specific
              reimbursement totals before submitting.
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy || !chosen.length}>
              {busy
                ? "Creating…"
                : `Create draft claim · ${chosen.length} expenses`}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
function Overview({
  data,
  navigate,
  setSelected,
}: {
  data: Data;
  navigate: (p: string) => void;
  setSelected: (id: string) => void;
}) {
  const claims =
    data.actor.role === "employee"
      ? data.claims.filter((c) => c.employeeId === data.actor.id)
      : data.claims;
  const expenses = data.expenses.filter((e) =>
    claims.some((c) => c.expenseIds.includes(e.id)),
  );
  const totals: Record<string, number> = {};
  expenses.forEach(
    (e) => (totals[e.currency] = (totals[e.currency] || 0) + e.amountMinor),
  );
  const pending = claims.filter(
    (c) => !["DRAFT", "REIMBURSED", "REJECTED"].includes(c.status),
  );
  const reimbursed: Record<string, number> = {};
  data.reimbursements.forEach((r) =>
    Object.entries(r.totals).forEach(
      ([cur, n]) => (reimbursed[cur] = (reimbursed[cur] || 0) + n),
    ),
  );
  const categories: Record<string, Record<string, number>> = {};
  expenses.forEach((e) => {
    categories[e.category] ??= {};
    categories[e.category][e.currency] =
      (categories[e.category][e.currency] || 0) + e.amountMinor;
  });
  const target = data.claims.find((c) => c.reference === "CLM-2026-0142");
  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div>
            <span>Total claimed</span>
            <Icon name="expenses" />
          </div>
          <strong>
            {Object.entries(totals)
              .map(([cur, n]) => money(n, cur))
              .join(" · ") || "—"}
          </strong>
          <small>Across {claims.length} visible claims</small>
        </div>
        <div className="stat-card">
          <div>
            <span>In the review pipeline</span>
            <Icon name="claims" />
          </div>
          <strong>
            {pending.length}
            <em>claims</em>
          </strong>
          <small>
            <i className="status-dot amber" /> Awaiting the next step
          </small>
        </div>
        <div className="stat-card">
          <div>
            <span>Recorded reimbursements</span>
            <Icon name="approvals" />
          </div>
          <strong>
            {Object.entries(reimbursed)
              .map(([cur, n]) => money(n, cur))
              .join(" · ") || "—"}
          </strong>
          <small>
            <i className="status-dot green" /> Recorded payments · No transfer
            integration
          </small>
        </div>
        <div className="stat-card">
          <div>
            <span>Review signals</span>
            <Icon name="investigations" />
          </div>
          <strong>
            {data.evaluations.filter((e) => e.findings.length > 0).length}
            <em>claims</em>
          </strong>
          <small>Evidence ready for a human review</small>
        </div>
      </div>
      <div className="overview-feature-grid">
        <section className="feature-banner">
          <div>
            <span className="eyebrow">MEET YOUR EXPENSE INVESTIGATOR</span>
            <h2>
              The full story.
              <br />
              Behind every claim.
            </h2>
            <p>
              Connect receipts, trip context and company policy.
              <br />
              Understand every flag before you make a decision.
            </p>
            <button
              className="light-button"
              onClick={() =>
                target ? setSelected(target.id) : navigate("Investigations")
              }
            >
              Explore an investigation <Icon name="arrow" size={17} />
            </button>
          </div>
          <div className="investigator-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-document">
              <div className="art-doc-top">
                <span>CLAIM REVIEW</span>
                <Icon name="investigations" size={26} />
              </div>
              <b>Evidence, connected.</b>
              <div className="art-line" />
              <div className="art-line short" />
              <div className="art-check">✓　Policy evaluation</div>
              <div className="art-check">✓　Receipt matching</div>
              <div className="art-check">✓　Trip context</div>
            </div>
            <div className="art-floating">
              <span className="status-dot green" /> Ready for human review
            </div>
          </div>
        </section>
        <Bars title="Where the spend goes" groups={categories} />
      </div>
    </>
  );
}
function Trips({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await request("/api/workspace/trips", "POST", Object.fromEntries(form));
      setOpen(false);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="filter-bar">
        <span className="muted">
          {data.trips.length} accessible business trips
        </span>
        <button className="primary push-right" onClick={() => setOpen(true)}>
          ＋ Create business trip
        </button>
      </div>
      <div className="trips-grid">
        {data.trips.map((t) => (
          <section className="panel trip-card" key={t.id}>
            <div className="section-heading">
              <span className="trip-icon">
                <Icon name="trips" size={23} />
              </span>
              <Badge value={t.status} />
            </div>
            <h3>{t.name}</h3>
            <div className="trip-route">
              <span>{t.origin}</span>
              <span>→</span>
              <strong>{t.destination}</strong>
            </div>
            <p>
              {t.startDate} — {t.endDate}
            </p>
            <p className="muted">{t.purpose}</p>
            <div className="trip-bottom">
              <span>
                {t.project} · {t.department}
              </span>
              <span>
                {data.expenses.filter((e) => e.tripId === t.id).length} expenses
              </span>
            </div>
          </section>
        ))}
      </div>
      {open && (
        <div className="modal-overlay">
          <form className="modal panel" onSubmit={save}>
            <div className="section-heading">
              <h2>Create business trip</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => setOpen(false)}
                aria-label="Close trip form"
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label className="full">
                Trip name
                <input name="name" required minLength={3} maxLength={120} />
              </label>
              <label>
                Origin
                <input name="origin" required minLength={2} />
              </label>
              <label>
                Destination
                <input name="destination" required minLength={2} />
              </label>
              <label>
                Start date
                <input name="startDate" type="date" required />
              </label>
              <label>
                End date
                <input name="endDate" type="date" required />
              </label>
              <label>
                Project / client
                <input name="project" />
              </label>
              <label>
                Status
                <select name="status">
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label className="full">
                Business purpose
                <textarea name="purpose" required minLength={3} />
              </label>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Create trip"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
function Policies({
  policies,
  actor,
  onSaved,
}: {
  policies: Policy[];
  actor: Profile;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Policy | null>(null);
  const [limit, setLimit] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      const { id, ...d } = editing;
      await request(`/api/workspace/policies/${id}`, "PATCH", {
        ...d,
        limitMinor: toMinor(limit),
      });
      setEditing(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="notice policy-notice">
        <Icon name="policies" />
        <div>
          These are fictional demonstration allowances. Over-limit expenses
          require a documented exception; a policy flag does not automatically
          reject a claim. Daily caps combine all employee expenses in the same
          category and currency.
        </div>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Expense category</th>
                <th>Allowance</th>
                <th>Applies to</th>
                <th>Effective dates</th>
                <th>Rule</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.category}</strong>
                    <small>{p.condition}</small>
                  </td>
                  <td className="amount">
                    {money(p.limitMinor, p.currency)}
                    <small>Per {p.basis}</small>
                  </td>
                  <td>
                    {p.department === "*" ? "All departments" : p.department}
                    <small>
                      {p.role === "*" ? "All employee roles" : p.role}
                    </small>
                  </td>
                  <td>
                    {p.effectiveFrom}
                    <small>through {p.effectiveTo}</small>
                  </td>
                  <td>
                    <Badge value={p.severity} />
                  </td>
                  <td>
                    {actor.role === "finance" && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setEditing({ ...p });
                          setLimit((p.limitMinor / 100).toFixed(2));
                          setError("");
                        }}
                      >
                        Edit policy
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <div className="modal-overlay">
          <form className="modal panel" onSubmit={save}>
            <div className="section-heading">
              <h2>Edit {editing.category} policy</h2>
              <button
                type="button"
                className="text-button"
                onClick={() => setEditing(null)}
                aria-label="Close policy editor"
              >
                ×
              </button>
            </div>
            <div className="form-grid">
              <label>
                Allowance amount ({editing.currency})
                <input
                  inputMode="decimal"
                  required
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </label>
              <label>
                Basis
                <select
                  value={editing.basis}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      basis: e.target.value as Policy["basis"],
                    })
                  }
                >
                  {["day", "night", "transaction"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Currency
                <input
                  required
                  pattern="[A-Z]{3}"
                  value={editing.currency}
                  onChange={(e) =>
                    setEditing({ ...editing, currency: e.target.value })
                  }
                />
              </label>
              <label>
                Department
                <input
                  value={editing.department}
                  onChange={(e) =>
                    setEditing({ ...editing, department: e.target.value })
                  }
                />
              </label>
              <label>
                Role
                <select
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value })
                  }
                >
                  {["*", "employee", "manager", "finance"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Severity
                <select
                  value={editing.severity}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      severity: e.target.value as Policy["severity"],
                    })
                  }
                >
                  <option value="warning">warning</option>
                  <option value="hard">hard</option>
                </select>
              </label>
              <label>
                Effective from
                <input
                  required
                  type="date"
                  value={editing.effectiveFrom}
                  onChange={(e) =>
                    setEditing({ ...editing, effectiveFrom: e.target.value })
                  }
                />
              </label>
              <label>
                Effective to
                <input
                  required
                  type="date"
                  value={editing.effectiveTo}
                  onChange={(e) =>
                    setEditing({ ...editing, effectiveTo: e.target.value })
                  }
                />
              </label>
              <label className="full">
                Exception conditions
                <textarea
                  value={editing.condition}
                  onChange={(e) =>
                    setEditing({ ...editing, condition: e.target.value })
                  }
                />
              </label>
              <label className="check-label full">
                <input
                  type="checkbox"
                  checked={editing.approvalRequired}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      approvalRequired: e.target.checked,
                    })
                  }
                />
                Require exception approval
              </label>
            </div>
            <p className="notice">
              An audit entry will retain the previous and updated policy values.
            </p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button disabled={busy} className="primary">
              {busy ? "Saving…" : "Save policy & audit change"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
