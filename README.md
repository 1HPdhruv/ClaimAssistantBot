# ClaimPilot

**AI-powered expense claims, policy checks, and reimbursement workflows.**

ClaimPilot is an expense-claim assistant built on a Next.js, Supabase, and Google Gemini starter. The current repository contains the foundational hackathon scaffold: a passcode-protected application, a server-side Supabase client, a Gemini function-calling loop with Zod-validated tools, and a small example task workflow.

> **Project status:** This repository is currently a starter scaffold, not a completed expense-management product. The expense workflows described below are the intended product direction; they should not be interpreted as already implemented. The only seeded application schema currently present is the starter `tasks` example and the legacy CampusBite workshop database.

---

## Product direction

ClaimPilot is intended to help employees prepare expense claims and help managers and finance teams review them with better context.

The product direction is built around five capabilities:

1. **Receipt intelligence** — extract merchant, date, category, currency, tax, and total from uploaded receipts, with employee review before saving.
2. **Policy-aware claims** — check expenses against configurable company rules and explain exceptions.
3. **Duplicate and anomaly investigation** — surface exact or likely duplicate submissions and unusual expense patterns with traceable evidence.
4. **Approval workflow** — support employee submission, manager review, finance verification, and reimbursement recording.
5. **AI copilot** — let users ask questions and perform permitted actions through validated server-side tools.

The key design principle is that AI assists with extraction, interpretation, and explanations. Deterministic server-side logic must enforce policy, permissions, calculations, and workflow transitions. A risk indicator is a reason for human review, not proof of fraud or an automatic rejection.

## Current repository capabilities

The starter currently includes:

- Next.js App Router with React and TypeScript.
- Tailwind CSS.
- Passcode-based login using an HTTP-only session cookie.
- Server-side Supabase client.
- Google Gemini integration through the `@google/genai` SDK.
- A bounded Gemini function-calling loop.
- Zod validation for agent tool arguments and API input.
- Example `listTasks`, `createTask`, and `completeTask` tools.
- An agent chat UI that displays tool execution steps.
- Example task list and REST endpoints.
- A health endpoint at `/api/health`.

### Current implementation boundaries

The repository does **not** currently contain a completed ClaimPilot schema or expense workflow. In particular, the current `main` branch does not contain the README-referenced `seed/ps5_expense_claims.sql` file. The `seed/` directory currently contains:

- `00_starter_example.sql` — creates and seeds the `tasks` table.
- `campusbite.sql` — legacy SRM canteen workshop schema and demo data. This is not the ClaimPilot database and should not be run for ClaimPilot setup.

The existing health endpoint checks the `tasks` table, so it is a starter health check rather than an expense-schema readiness check.

## Technology stack

| Layer | Technology |
| --- | --- |
| Web framework | Next.js App Router |
| UI | React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database | Supabase PostgreSQL |
| AI | Google Gemini via `@google/genai` |
| Tool and API validation | Zod |
| Hosting target | Vercel |
| Runtime | Node.js 20 or later |

The current dependency versions are defined in `package.json`. Use the lockfile and the repository's existing package manager workflow.

## Repository structure

```text
.
├── app/
│   ├── api/
│   │   ├── agent/route.ts       # POST /api/agent
│   │   ├── health/route.ts      # GET /api/health
│   │   ├── login/route.ts       # POST /api/login
│   │   ├── logout/route.ts      # POST /api/logout
│   │   └── tasks/route.ts       # Example task API
│   ├── login/page.tsx           # Passcode login screen
│   ├── globals.css              # Global Tailwind styles
│   ├── layout.tsx               # Root layout and metadata
│   └── page.tsx                 # Starter agent + task-list screen
├── components/
│   ├── AgentChat.tsx            # Chat UI and tool execution trace
│   └── TaskList.tsx             # Example live task list
├── lib/
│   ├── agent/
│   │   ├── defineTool.ts        # Zod-to-Gemini tool definitions
│   │   ├── runAgent.ts          # Bounded Gemini tool loop
│   │   ├── systemPrompt.ts      # Agent behaviour instructions
│   │   ├── tools.ts             # Example task tools
│   │   └── types.ts             # Agent response types
│   ├── auth.ts                  # Passcode hashing and session checks
│   ├── dates.ts                 # India-local date helpers
│   ├── env.ts                   # Server-side environment validation
│   ├── gemini.ts                # Gemini client
│   ├── schemas.ts               # Shared Zod schemas
│   └── supabase.ts              # Server-only Supabase client
├── seed/
│   ├── 00_starter_example.sql   # Starter tasks schema and sample rows
│   └── campusbite.sql           # Legacy workshop data; not used by ClaimPilot
├── live-demo/
│   ├── DEMO_SCRIPT.md
│   └── LIVE_BUILD_PROMPTS.md
├── .env.example
├── CLAUDE.md
├── next.config.ts
├── package.json
├── package-lock.json
├── proxy.ts
└── tsconfig.json
```

## Getting started locally

### Prerequisites

- Node.js 20 or later.
- npm.
- A Supabase project.
- A Google Gemini API key from [Google AI Studio](https://aistudio.google.com/).

### 1. Clone the repository

```bash
git clone https://github.com/1HPdhruv/ClaimAssistantBot.git
cd ClaimAssistantBot
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Configure Supabase

Create a project at [Supabase](https://supabase.com/).

For the **current starter demo**, open the Supabase SQL Editor and run:

```text
seed/00_starter_example.sql
```

This creates the `tasks` table used by the existing example tools and task list.

Do not run `seed/campusbite.sql` for ClaimPilot. It creates unrelated canteen ordering tables and functions.

> The ClaimPilot-specific expense schema and seed data must be added before expense-management functionality can be considered database-ready.

### 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set the following server-side values:

| Variable | Required | Description |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes for AI | Gemini API key from Google AI Studio |
| `GEMINI_MODEL` | No | Model identifier; defaults in `lib/env.ts` |
| `SUPABASE_URL` | Yes | Supabase project URL, e.g. `https://<project-ref>.supabase.co` |
| `SUPABASE_SECRET_KEY` | Yes | Supabase server-side secret/service-role key |
| `APP_PASSCODE` | Yes | Shared passcode used by the starter login |

Keep `.env.local` private. It is ignored by Git. Never prefix server secrets with `NEXT_PUBLIC_`, expose them in client components, or commit them.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), enter the configured app passcode, and try the starter task assistant.

### 6. Run checks

```bash
npm run typecheck
npm run build
```

The current package scripts include `dev`, `build`, `start`, and `typecheck`. A test script is not currently defined in the starter.

## How the starter AI agent works

The existing agent is a server-side tool-calling loop:

1. The browser posts a validated conversation to `POST /api/agent`.
2. The server sends the conversation and registered tool declarations to Gemini.
3. Gemini may request one or more registered tools.
4. Tool arguments are parsed against their Zod schemas.
5. The server executes the tool implementation.
6. Tool results are returned to Gemini for the next model turn.
7. The API returns the final response and the tool execution trace.

The loop is bounded to five rounds to limit runaway tool calls.

Tools are defined in `lib/agent/tools.ts` using `defineTool()`. Each tool should have a narrow purpose, a clear description, a strict schema, server-side business validation, and a small structured result.

For ClaimPilot, replace the example task tools with expense-specific operations only after the corresponding database schema and authorization rules exist.

## Vercel deployment

ClaimPilot is a Next.js application and is intended to deploy on [Vercel](https://vercel.com/).

### 1. Push the project to GitHub

Make sure the branch you want to deploy (normally `main`) contains the code you intend to publish.

### 2. Import the repository into Vercel

1. Sign in to [Vercel](https://vercel.com/).
2. Select **Add New → Project**.
3. Import `1HPdhruv/ClaimAssistantBot` from GitHub.
4. Confirm the framework is detected as **Next.js**.
5. Keep the repository root as the project root.
6. Use the default build command, `npm run build`, and output settings unless Vercel detects them automatically.

### 3. Add environment variables

In Vercel, open **Project → Settings → Environment Variables** and add:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional)
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `APP_PASSCODE`

Add the variables to the environments where they are needed (Production, Preview, and/or Development). Use the same server-only values as the intended environment. Do not paste secrets into GitHub files or expose them in client-side variables.

For safer practice, use a dedicated Supabase project for preview/testing and keep production data separate.

### 4. Deploy

Select **Deploy** in Vercel. Review the build logs. A successful deployment should produce a `*.vercel.app` URL.

### 5. Verify the deployment

Open the deployed app and:

1. Confirm the login page loads.
2. Sign in using the configured `APP_PASSCODE`.
3. Confirm the starter dashboard loads.
4. Try a read-only task query.
5. Try creating a task if the starter SQL was applied.
6. Check `https://YOUR-VERCEL-DOMAIN/api/health`.

The current health endpoint checks whether the environment variables exist and whether the Supabase `tasks` table can be queried. It does not yet verify ClaimPilot expense tables.

If environment variables are changed after deployment, trigger a new deployment so the build/runtime receives the updated configuration.

### Common deployment issues

| Symptom | What to check |
| --- | --- |
| Build fails | Review Vercel build logs; run `npm ci`, `npm run typecheck`, and `npm run build` locally |
| Login fails | Confirm `APP_PASSCODE` exists in the correct Vercel environment and redeploy |
| Gemini requests fail | Confirm `GEMINI_API_KEY` and that the configured model is available to the API key |
| Supabase connection fails | Verify the project URL and server-side secret key |
| Database query fails | Confirm `seed/00_starter_example.sql` was run on the intended Supabase project |
| Health check reports missing values | Add the missing environment variables in Vercel and redeploy |

## Security notes

- The Supabase client is marked server-only and uses a privileged server credential. Keep its usage inside server-side code.
- The passcode gate uses an HTTP-only cookie and a hash of the configured passcode.
- Agent tool arguments are validated with Zod before execution.
- Keep environment variables out of source control and browser bundles.
- Before adding employee, manager, and finance roles, implement real server-side identity and authorization checks. The current shared passcode is a hackathon access gate, not multi-user enterprise authentication.
- Do not use AI-generated risk scores as automatic proof of fraud or as the sole basis for rejecting claims.
- Treat receipt documents and extracted personal/financial data as sensitive.

## Roadmap

The following are product goals, not claims about the current implementation:

- [ ] Replace the starter task UI with ClaimPilot workspace screens.
- [ ] Add employee, manager, and finance identities with server-side authorization.
- [ ] Design ClaimPilot PostgreSQL schema and fictional demo seed data.
- [ ] Add private receipt upload and Gemini extraction with human review.
- [ ] Implement deterministic expense-policy evaluation.
- [ ] Implement exact and fuzzy duplicate detection.
- [ ] Build claim submission and approval state transitions.
- [ ] Add reimbursement calculation and finance verification.
- [ ] Build the evidence-based investigation workspace.
- [ ] Add database-backed finance analytics.
- [ ] Add automated tests for policy, duplicate, authorization, and workflow logic.

## Contributing

1. Create a focused branch for your change.
2. Keep server-side credentials in server-only modules.
3. Validate external input with Zod.
4. Enforce business rules in code/database, not only in an AI prompt.
5. Run `npm run typecheck` and `npm run build` before opening a pull request.
6. Update documentation when setup, environment variables, database schema, or user flows change.

## License

No license file is currently included. Unless a license is added, the repository should be treated as having no explicit open-source reuse license.

---

**Built for the SRM Agentic AI Hackathon.**
