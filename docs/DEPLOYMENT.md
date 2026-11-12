# Existing Vercel production deployment

Target repository: https://github.com/1HPdhruv/ClaimAssistantBot (`main`).
Target existing project: `claim-assistant-bot-n6xl` in `dhruvs-projects-d6f6b32b`.
Production URL: https://claim-assistant-bot-n6xl.vercel.app

## Pre-deployment validation — 12 November 2026

- `npm test`: 24 passed, including isolated PostgreSQL schema/seed checks.
- `npm run test:agent`: 2 passed.
- `npm run test:integration`: 2 passed, including employee/manager/finance browser workflows.
- `npm run typecheck`: passed.
- `npm run build`: passed using the standard native Turbopack compiler.
- `.env.local`, all environment variants except `.env.example`, `.vercel/`, dependencies, build output, runtime demo state, screenshots, temporary files and logs are excluded from Git.

The local `origin` remote refers to the legacy CampusBite repository. Deploy only through the `claimbot` remote pointing to the repository above. Preserve the existing remote README commit when integrating implementation history. Never force-push.

## Production configuration audit

No secret values are included here. The existing Vercel project is configured for Next.js, repository root `.`, production branch `main`, Node.js `26.x`, and the standard build command.

| Variable name | Existing production configuration |
|---|---|
| `APP_PASSCODE` | Present and nonempty |
| `APP_SESSION_SECRET` | Absent; the application supports falling back to `APP_PASSCODE` |
| `CLAIMPILOT_STORAGE` | Absent; defaults to local demo mode |
| `CLAIMPILOT_DATA_DIR` | Absent; optional local development override |
| `SUPABASE_URL` | Name exists, value empty |
| `SUPABASE_SECRET_KEY` | Name exists, value empty |
| `GEMINI_API_KEY` | Name exists, value empty |
| `GEMINI_MODEL` | Name exists, value empty; the application has a default |

Environment values were inspected only through private temporary files outside the repository and were never printed or committed. No production environment values were changed.

## Backend blockers

The current environment can display the fictional ClaimPilot demo and authenticate demo identities, but is not configured for persistent serverless workflows. Filesystem demo state is unsuitable for Vercel; writes to the default deployment filesystem may fail and must not be presented as verified production workflows.

A durable setup requires the intended Supabase endpoint and server-only credential, the ClaimPilot schema/seed in the designated database, a private `receipts` bucket, and `CLAIMPILOT_STORAGE=supabase`. This deployment task does not authorize changing production database records, so no schema/seed SQL or mutations are executed. Local database tests do not verify hosted Supabase or Storage.

Gemini receipt extraction and conversational AI require a configured `GEMINI_API_KEY` and supported model. Their production integration is unavailable until configured. Do not test AI mutation tools or create expenses/claims during production verification.

## Deployment and verification procedure

Push the integrated, validated commit safely to GitHub `main` and allow the existing GitHub–Vercel integration to deploy it. Verify the exact commit in deployment metadata, the Ready state, production domain alias, HTTP login/health routes, ClaimPilot branding, and read-only authenticated workspace routes. Never create another project or change database records. Report the final commit and deployment IDs separately after the integration completes.
