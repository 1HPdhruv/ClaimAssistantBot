"use client";
import { useState, useEffect } from "react";
export default function LoginPage() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [identity, setIdentity] = useState("employee");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity, passcode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setLoading(false);
    }
  }
  return (
    <main className="login-shell">
      <div className="login-story">
        <a className="brand" href="/">
          <span className="brand-icon">↗</span>ClaimPilot
          <span className="brand-dot">.</span>
        </a>
        <div>
          <span className="eyebrow">EXPENSES, WITH CLARITY</span>
          <h1>
            Every claim.
            <br />A clearer picture.
          </h1>
          <p>
            Your intelligent expense claim & reimbursement copilot. From the
            first receipt to the final review.
          </p>
          <div className="login-proof">
            ✓ Evidence-based insights　 ✓ Human-led decisions
          </div>
        </div>
        <small>Built for better business journeys.</small>
      </div>
      <form className="login-form" onSubmit={login}>
        <span className="eyebrow">WELCOME TO CLAIMPILOT</span>
        <h2>Take a seat at your workspace</h2>
        <p className="muted">
          Choose a fictional demo identity. Roles are fixed on the server.
          Shared demo access is for evaluation, not production identity
          management.
        </p>
        <label>
          Demo workspace
          <select
            disabled={!ready}
            value={identity}
            onChange={(e) => setIdentity(e.target.value)}
          >
            <option value="employee">Aarav Sharma · Employee</option>
            <option value="manager">Neha Kapoor · Manager</option>
            <option value="finance">Isha Patel · Finance administrator</option>
          </select>
        </label>
        <label>
          Team passcode
          <input
            type="password"
            disabled={!ready}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Use APP_PASSCODE if configured"
          />
        </label>
        <button className="primary" disabled={!ready || loading}>
          {loading ? "Signing in…" : "Open workspace →"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="notice">
          Fictional demo data · No real payments are made.
          <br />
          Local development works without a passcode when one is not configured.
        </div>
      </form>
    </main>
  );
}
