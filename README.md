# ClaimPilot

**Your Intelligent Expense Claim & Reimbursement Copilot.**

A working hackathon expense platform with employee, manager and finance workspaces; private receipt uploads; Gemini extraction with human review; deterministic allowances; explainable duplicate and trip checks; audited approvals; recorded reimbursements; and a permission-bound conversational copilot.

Source: [1HPdhruv/ClaimAssistantBot](https://github.com/1HPdhruv/ClaimAssistantBot). Existing Vercel production target: [ClaimPilot](https://claim-assistant-bot-n6xl.vercel.app).

All bundled identities, policies and transactions are fictional. This is a shared-passcode demo, not production enterprise authentication. It never transfers money.

## Run locally

Requires Node.js 20.9+ (validated here with Node 24) and npm.

```sh
git clone https://github.com/1HPdhruv/ClaimAssistantBot.git
cd ClaimAssistantBot
npm install
# If you do not already have .env.local, copy .env.example to it.
npm run dev
# If macOS stalls loading the native compiler, use npm run dev:portable instead.
```

Open http://localhost:3000. Choose Employee (Aarav Sharma), Manager (Neha Kapoor), or Finance (Isha Patel). Enter `APP_PASSCODE` if your existing `.env.local` configures it. A local demo with no passcode configured accepts a blank passcode. No credentials are required for the rules or workflows.

The default `CLAIMPILOT_STORAGE=local` persists records and original uploads under `.claimpilot/`, which is ignored by Git. The initial fictional dataset is loaded automatically. An existing `.env.local` is preserved; it is never displayed, committed, or rewritten. Supabase credentials alone do not enable remote writes.

## What works

- Responsive overview, searchable expenses/claims, trip creation, draft editing and deletion, claim builder, role-specific approvals, evidence workspace, editable finance policies, dated analytics, copilot and settings.
- Receipt JPG/JPEG, PNG, WebP and PDF validation using content signatures, with a 10 MB limit. SHA-256 hashes are generated from original bytes. Private original documents remain available if Gemini fails.
- Multimodal Gemini extraction produces Zod-validated structured fields, original amounts/currencies, line items and uncertainty. Human review is mandatory before saving. Corrections are retained separately from original extraction. No successful AI response is simulated.
- Category, transaction, daily and nightly policies; department and role scopes; effective dates; warning/hard findings; configurable exception instructions. Missing policies/currencies are sent for finance review rather than converted.
- Exact file, receipt-reference and fuzzy metadata matching; missing-document, trip-date, historical spending, frequency, category and total consistency signals. Evidence links refer to actual expense UUIDs. Private cross-employee matches are withheld from employees; authorized reviewers can inspect team evidence.
- Currency-separated submitted, eligible and excess calculations; documented manager exceptions; safe state transitions; clarification and correction; reviewer-only internal notes; mandatory rejection reasons; single recorded reimbursement per claim; timestamped audit history.
- Twenty equivalent domain tools across the role-specific Gemini toolsets. Consequential AI actions prepare expiring proposals, and execute only after an authenticated user clicks confirmation. Tool execution is visible.
- Finance department/category/month aggregates and date filters use stored records. Recorded payment amounts come from reimbursement records. No hardcoded dashboard totals.

## Demo dataset

8 profiles (5 employees, 2 managers, 1 finance administrator), 3 departments, 4 trips, 14 expenses, 6 claims in different states, 11 policies and fictional receipt summaries. Seeded evidence is explicitly a text summary, not an original receipt or verified extraction.

Open **Investigations → CLM-2026-0142**. The Bengaluru claim contains hotel ₹8,500, restaurant ₹1,800, taxi ₹2,200, flight ₹7,400 and undocumented client dinner ₹3,600. Actual rules find hotel/meal/transport excess, a duplicate taxi record, a missing dinner document and a dinner outside trip dates. A second meal duplicate is also seeded. Scores display their weighted signals and never automatically reject claims.

## Supabase development setup

Do not run the legacy CampusBite SQL. Create a separate development project and apply, in order, through its SQL editor:

1. `supabase/migrations/20261112093656_claimpilot_development_schema.sql`
2. `seed/ps5_expense_claims.sql`

Then set `CLAIMPILOT_STORAGE=supabase`, `SUPABASE_URL` and server-only `SUPABASE_SECRET_KEY` in `.env.local`, and restart Next.js. Seed only initializes an empty ClaimPilot workspace; it does not reset existing records. The migration is one-time setup and intentionally fails if those ClaimPilot tables already exist. No remote SQL was applied during implementation.

The private `claimpilot` schema holds profiles, departments, trips, expense_policies, expenses, receipts, claims, claim_expenses, policy_violations, duplicate_matches, investigations, approvals, reimbursements and audit_logs. Entity payloads use JSONB with generated, constrained and indexed relational columns and foreign keys. Money is stored as `bigint` minor units. All tables enable RLS and deny browser access; no permissive policies are installed. The app uses the service credential only on the server, where shared-demo session authorization is enforced.

`claimpilot_read` and `claimpilot_write` are SECURITY INVOKER RPCs, executable only by `service_role`. Writes use an atomic transaction, revision lock and optimistic version check to prevent lost updates. Derived evidence tables are persisted from the same deterministic engine. This small-workspace snapshot approach is optimized for a hackathon, not a large enterprise database. See `docs/ARCHITECTURE.md`.

The `receipts` Storage bucket is private. Upload and document endpoints fail closed if the bucket is public or inaccessible. If a bucket with that name already exists, verify it is private before using it; the migration does not overwrite existing storage configuration. Never reuse a public bucket for real receipts. Original-document endpoints authorize access and issue signed Supabase URLs valid for 60 seconds. Uploads and signed URL retrieval require a configured Supabase Storage service; local mode uses authenticated filesystem reads instead.

## Gemini setup

Set `GEMINI_API_KEY` from Google AI Studio and a supported `GEMINI_MODEL` for your account. The example uses `gemini-2.5-flash`; replace an inherited starter model if unavailable. Restart the server.

The SDK is server-only. Receipts are passed as inline multimodal data. Extraction uses JSON structured output and Zod. Conversational requests use the existing bounded five-round function-calling loop, upgraded with actor-bound tools. If quota, model, validation or network errors occur, uploads remain preserved; use manual entry. The UI honestly reports unavailable AI. Provider secrets/errors are not returned to the browser.

## Tests and build

```sh
npm test
npm run test:agent
npx playwright install chromium
npm run test:integration
npm run typecheck
npm run build
npm start
```

Unit tests cover rules, daily/night allowances, exact minor-unit money, duplicates, trip consistency, risk weights, role isolation, transitions, exceptions and corrections. PGlite runs the SQL schema/seed in an isolated PostgreSQL environment and checks permissions, RLS, relational evidence and revision conflicts. It is not a hosted Supabase integration test.

Agent tests verify validation, role-scoped tools and single-use human confirmations without calling Gemini. Integration tests start an isolated Next.js server on port 3217 with temporary persistence and explicit test credentials. They check HTTP workflows, upload fallback, privacy, CSRF and session tampering. Playwright completes trip/expense/claim submission in the UI and checks mobile overflow and browser errors. Screenshots are written to `artifacts/`.

## Vercel

Import this repository and use the Next.js preset with `npm run build`. Configure `APP_PASSCODE`, a long `APP_SESSION_SECRET`, `CLAIMPILOT_STORAGE=supabase`, development Supabase credentials, and optional Gemini credentials. Apply the development SQL and seed first. Keep credentials server-only. Do not use filesystem persistence on Vercel: deployments have ephemeral/read-only filesystems and multiple server instances. No Vercel deployment was performed here.

## Exact demo walkthrough

1. Run locally; sign in as Employee. Overview shows record-derived totals. Create a trip in Business Trips.
2. Submit Claim: upload a supported receipt. If AI is available, inspect the extracted fields and uncertainty; otherwise manually enter them. Select your trip, enter purpose, save the draft.
3. My Expenses → Create claim from drafts → select expenses → create draft. Inspect totals/findings and click Submit claim, then Confirm action.
4. Sign out and choose Manager with the same team passcode. Approvals → open that claim. Inspect evidence, comment and approve (or request clarification/reject). Confirm the action. Exceptions require a written manager justification.
5. Sign out and choose Finance. Approvals → open approved claim → Finance verification → Reimbursement processing → enter reference/date → Record reimbursement → confirm. This records a payment; no funds move.
6. Finance Analytics shows updated aggregates. Claim history retains the actors and decisions.
7. With Gemini configured, AI Copilot → ask about claims, policies or draft creation. Inspect tool execution. Submission/review proposals display explicit confirmation buttons. An employee cannot obtain approval tools or impersonate another actor.

### Recommended three-minute presentation

- **0:00–0:30:** Employee overview; show the cohesive expense workspace and fictional-data label.
- **0:30–1:20:** Open CLM-2026-0142 investigation. Explain nightly cap, duplicate taxi evidence, missing dinner document and trip-date mismatch. Show the transparent risk weights and reimbursement breakdown.
- **1:20–1:50:** Upload a real sample receipt, review extracted fields (or clearly demonstrate manual fallback), save a draft and create/submit a claim.
- **1:50–2:35:** Switch to Manager, review evidence and approve. Switch to Finance and record the reimbursement reference.
- **2:35–3:00:** Show history/analytics and ask the configured copilot to explain a finding, with visible authorized tool execution.

## Troubleshooting and limits

- Login fails: use the existing `APP_PASSCODE`. Production requires a configured passcode; session signing uses `APP_SESSION_SECRET` or that passcode. Do not reuse this shared identity selection for production HR data.
- Database unavailable: verify the explicit mode, apply both SQL files to the intended development project, and check service-role credentials and RPC exposure. Errors never silently switch remote data to local seed.
- Blank Supabase workspace: the schema may be installed but seed omitted. Apply the seed once.
- Receipt fails: check actual format/10 MB limit/private bucket. AI extraction failure preserves uploads. PDFs use authenticated original-document viewing; browsers without PDF preview can open/download them.
- The macOS native compiler initially stalled in the OS loader. After a clean dependency install and the delayed native load completing, the standard `npm run build` passed. If this recurs, `npm run dev:portable` and `npm run build:portable` use Next’s WebAssembly compiler with webpack; this fallback was also validated.
- Local state is single-process serialized; use Supabase for multi-instance demos. Private uploads can be orphaned if a database write fails after storage succeeds; retention cleanup is not implemented.
- Not implemented: production SSO, organization tenancy, email notifications, payment rails, FX rates, image perceptual similarity, attachment malware scanning, banking verification and configurable arbitrary policy expressions. Fuzzy matching uses deterministic metadata, not visual similarity.
- Daily caps allocate allowance chronologically across all recorded employee/category/currency expenses. A missing policy or document holds standard eligibility at zero until an authorized exception. Flags do not reject a claim. Hard violations change severity; they still require human decisions.
- Policy edits recompute current evaluations. Approved currency totals are frozen and used for reimbursement, so later policy edits cannot change an approved payment amount. Historical audits retain decisions and policy before/after changes; a full versioned policy document is not snapshotted at every approval.
- Live Gemini and hosted Supabase Storage were implemented but not exercised against external credentials during validation. Mock success responses are never used. Full automated results are recorded in `docs/DELIVERY.md`.

## License

No license file is currently included. The repository has no explicit open-source reuse license.
