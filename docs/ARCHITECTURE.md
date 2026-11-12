# Architecture and implementation checklist

Implemented in the existing repository; no commits, pushes, remote migrations or deployments performed.

- [x] Audit starter, working tree, source, session gate, tool loop, seed and environment template.
- [x] Define typed domain models and strict Zod payloads.
- [x] Implement deterministic limits, duplicates, trip checks, risk weights and currency-separated calculator.
- [x] Enforce owner/manager/finance access and claim state machine.
- [x] Persist local demo state and private receipts; add opt-in atomic Supabase repository.
- [x] Provide fictional scenario data and SQL schema/seed.
- [x] Build employee, manager and finance workspaces.
- [x] Add multimodal extraction, human review and manual fallback.
- [x] Adapt Gemini tools with session identity and confirmed consequential operations.
- [x] Connect evidence review, comments, reimbursements and analytics.
- [x] Test business logic, SQL, agent permissions, HTTP flows and browser UI.
- [x] Document setup, demo, external-service limitations and deployment requirements.

## Boundaries

`types.ts` describes records; `schemas.ts` validates payloads and parses exact decimal strings into minor units. `engine.ts` has no external service dependencies and owns authorization predicates, policy evaluation, duplicates, risk scoring, eligibility and permitted state transitions.

`service.ts` is the shared mutation layer called by REST routes and agent tools. Both derive the actor from an authenticated server session. `session.ts` uses HTTP-only signed cookies, looks up the identity in the stored profiles and checks mutation origins. No browser or model argument supplies an actor ID. A shared passcode permits selecting only three predefined fictional identities. This is intentionally a demo authentication boundary.

`store.ts` serializes local operations and atomically renames a private state file. Supabase mode loads private entity tables through a service-only read RPC, then writes a validated state snapshot in one transaction using a version check. A conflicting writer returns HTTP 409; it never overwrites the winning state. Relational evidence tables are updated in that transaction. This favors correctness and maintainability for a small single-organization demonstration; large deployments need scoped per-entity transactions and real Supabase Auth/SSO before use with actual employee data.

Entity tables retain typed JSONB payloads and relational generated columns, rather than maintaining separate SQL and TypeScript versions of every display field. UUID PKs, foreign keys, unique claim/reference constraints, bigint money constraints, role/status constraints, indexes and RLS enforce useful invariants. The private schema has no browser grants; RLS has a deny-all default. Service-only SECURITY INVOKER RPCs avoid privileged public definer functions. The storage bucket has no public document policies. Authorization is always rechecked in server routes before issuing a 60-second signed URL.

`receipts.ts` validates image/PDF signatures and extraction shape. The upload route hashes and stores original bytes before extraction. The expense stores reviewed fields and corrections separately from receipt extraction. Seeded receipt summaries explicitly state they are fictional, unverified evidence.

The existing `defineTool.ts`, `runAgent.ts`, `systemPrompt.ts` and `tools.ts` now serve ClaimPilot. Tool arguments are validated both by the executor and the definition itself. Reads filter to authorized records; writes call the same domain service. Consequential tools create actor-bound audit proposals with ten-minute expiry. `/api/agent/confirm` revalidates permission, lifecycle and proposal ownership atomically, executes once and marks the proposal consumed. There is no conversational “yes” bypass.

## Signals and calculation

- Policy excess: +15 per applicable over-limit rule.
- Identical file hash: +40 per matched expense; matching merchant/reference or merchant/amount/date/currency: +25.
- Outside trip dates: +20; missing document: +10; absent applicable policy: +5.
- Receipt total mismatch: +15; extracted category mismatch: +5 (explicitly unverified AI classification).
- Threefold historical-category outlier with at least three earlier observations: +10; more than eight daily expenses: +5; non-economy/unknown flight cabin: +10.

Sum displayed weights and cap at 100. Low <15, Medium 15–39, High 40–69, Critical ≥70. Matching metadata is a potential duplicate, never proof of fraud. Scores never reject claims.

No monetary float arithmetic is used for business calculations. UI formatting divides minor units by 100 for display only. Daily limits allocate allowance to earlier expense records, using creation time and UUID as a stable tiebreaker. Missing documents or an unconfigured category/currency receive zero standard eligibility until a documented manager exception. Manager approval remains authoritative; the calculator does not grant approval. Approved currency totals are snapshotted at manager approval and retained even if a policy changes later. Reimbursement records use those frozen approved amounts and retain the recorded reference and date.

## Original audit

Clean `main` branch, no uncommitted changes. The project had Next.js App Router, React, TypeScript, Tailwind, server-only Supabase, a static shared-passcode hash cookie, a bounded Gemini tool loop and three task tools. README advertised missing problem seeds including `ps5_expense_claims.sql`; only `00_starter_example.sql` and `campusbite.sql` existed. CLAUDE/copilot instructions still prescribed CampusBite. There was no expense domain, private receipt workflow, claim state machine or tests. Existing `.env.local` was preserved without printing values. Legacy SQL remains in `seed/` for historical reference and is never executed by ClaimPilot.

## References checked

- [Supabase changelog](https://supabase.com/changelog)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Signed URLs](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing)
