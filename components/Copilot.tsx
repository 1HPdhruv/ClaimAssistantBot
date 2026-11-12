"use client";
import { useState } from "react";
import type { AgentResult } from "@/lib/agent/types";
import { Icon, request } from "./ui";
type Message = {
  role: "user" | "model";
  text: string;
  steps?: AgentResult["steps"];
};
export default function Copilot({
  configured,
  onChanged,
}: {
  configured: boolean;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState<string[]>([]);
  async function send(e?: React.FormEvent, value = text) {
    e?.preventDefault();
    if (!value.trim()) return;
    const next = [...messages, { role: "user" as const, text: value }];
    setMessages(next);
    setText("");
    setBusy(true);
    setError("");
    try {
      const r = await request("/api/agent", "POST", {
        messages: next.slice(-28).map(({ role, text }) => ({ role, text })),
      });
      setMessages([...next, { role: "model", text: r.reply, steps: r.steps }]);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(id: string) {
    setBusy(true);
    try {
      await request("/api/agent/confirm", "POST", { proposalId: id });
      setConfirmed((c) => [...c, id]);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel copilot">
      <div className="copilot-header">
        <span className="copilot-avatar">
          <Icon name="copilot" size={24} />
        </span>
        <div>
          <h3>Your expense copilot</h3>
          <p className="muted">
            Grounded in your records. Guided by your permissions.
          </p>
        </div>
        <span className={`connection ${configured ? "online" : ""}`}>
          {configured ? "Gemini configured" : "AI unavailable"}
        </span>
      </div>
      <div className="messages" aria-live="polite">
        {!messages.length && (
          <div className="copilot-welcome">
            <Icon name="copilot" size={38} />
            <h2>Let’s make sense of your expenses.</h2>
            <p>
              Investigate a flag, understand an allowance, or prepare your next
              claim.
            </p>
            <div className="suggestions">
              {[
                "Show my pending reimbursements",
                "Explain the findings for my Bengaluru claim",
                "Help me create a claim from draft expenses",
                "What are the meal and hotel policies?",
              ].map((s) => (
                <button
                  key={s}
                  disabled={busy || !configured}
                  onClick={() => send(undefined, s)}
                >
                  {s}
                  <span>↗</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <span className="tiny-label">
              {m.role === "user" ? "YOU" : "CLAIMPILOT"}
            </span>
            <p>{m.text}</p>
            {m.steps?.map((step, j) => (
              <details
                key={j}
                className="tool-call"
                open={
                  !!(step.result as { confirmationRequired?: boolean })
                    ?.confirmationRequired
                }
              >
                <summary>
                  {step.ok ? "✓" : "!"} {step.tool} ·{" "}
                  {step.writes ? "Write tool" : "Tool execution"}
                </summary>
                <pre>
                  {JSON.stringify(
                    step.ok ? step.result : { error: step.error },
                    null,
                    2,
                  )}
                </pre>
                {(step.result as { confirmationRequired?: boolean })
                  ?.confirmationRequired &&
                  (() => {
                    const r = step.result as {
                      proposalId: string;
                      status: string;
                    };
                    return (
                      <button
                        className="primary"
                        disabled={busy || confirmed.includes(r.proposalId)}
                        onClick={() => confirm(r.proposalId)}
                      >
                        {confirmed.includes(r.proposalId)
                          ? "Confirmed and recorded"
                          : `Confirm ${r.status.toLowerCase().replaceAll("_", " ")}`}
                      </button>
                    );
                  })()}
              </details>
            ))}
          </div>
        ))}
        {busy && (
          <p className="muted pulse">Working with your authorized records…</p>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {!configured && (
        <div className="notice">
          Gemini is not configured. Use Submit Claim for manual expense entry
          and Investigations for deterministic findings.
        </div>
      )}
      <form className="chat-form" onSubmit={send}>
        <input
          aria-label="Message ClaimPilot"
          placeholder="Ask about your expenses, policies or claims…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy || !configured}
        />
        <button
          className="primary"
          disabled={busy || !configured || !text.trim()}
          aria-label="Send message"
        >
          <Icon name="arrow" />
        </button>
      </form>
      <small className="chat-footnote">
        AI can make mistakes. Review original evidence. Consequential actions
        require your confirmation.
      </small>
    </section>
  );
}
