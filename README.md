# Race Edge 2.0 — Phase 4 frontend

An **iPad-landscape-first, iPhone-responsive** Next.js frontend for the existing FastAPI + Supabase Race Edge backend. F1-inspired navy, graphite and gold. This is a real frontend, not a mock-up.

## Features implemented

- Password sign-in with signed, HttpOnly, SameSite=Strict session cookie.
- Server-only proxy for existing protected `/api/cards/*` and `/api/db/horse/{horse}` endpoints. **API key is never sent to the browser.**
- Meeting date and race selection, automatic card and prediction loading.
- Recent Best and Latest Form scenario switcher, Peak Ability optional.
- Cumulative lengths behind leader calculated from the API's **margin behind previous** values.
- Select runners to see Supabase history, RPSS, MR Achieved and sustain residuals.
- Compare up to four horses' projection values.
- iPad three-panel workspace; phone tabbed layout.

**Not implemented yet:** Race Plane and Pace Curve plots (require additional sectionals API endpoints), full PDF export, offline access, detailed automated parity validation. The initial frontend does not change prediction maths.

## Deployment — easiest for iPad-only setup

**Use a NEW GitHub repository** (e.g. `race-edge-frontend`) for these files. Keep your current `Race-Edge` Python repository and Render deployment unchanged.

1. Unzip and upload the **contents** of this folder to the root of the new GitHub repo (including `app/`, `lib/`, `public/`).
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, import the frontend repository. Framework: **Next.js**; Root Directory: repository root.
3. In Vercel Project Settings → Environment Variables, set these **server-only** variables (no `NEXT_PUBLIC_` prefix):
   - `RACE_EDGE_BACKEND_URL` = `https://race-edge-api.onrender.com` (or your actual Render backend URL)
   - `RACE_EDGE_API_KEY` = same private key already configured in Render
   - `RACE_EDGE_LOGIN_PASSWORD` = **a different strong password** for logging into the frontend (at least 16 characters)
   - `RACE_EDGE_SESSION_SECRET` = a new random string of at least 32 characters (64 recommended)
4. Deploy. Visit the Vercel URL and sign in with `RACE_EDGE_LOGIN_PASSWORD`.

**Never** put secrets in `.env.example`, GitHub commits, screenshots, `NEXT_PUBLIC_*` variables, or browser JavaScript. Your GitHub frontend repo should be **Private**. Keep Render's `RACE_EDGE_API_KEY` unchanged.

## Local development (optional)

```bash
npm install
cp .env.example .env.local
# Fill .env.local with actual server-only values
npm run dev
```

## Security note

This starter uses a single shared login password and signed session cookies. Before exposing it to multiple users, add managed authentication, rate limiting and audit logging. Protect Vercel deployment access until these are in place. The Render API still accepts requests directly with its secret header and is separate from the frontend session.

## API compatibility

Matches Phase 3 `/api/cards/meetings`, `/api/cards/races`, `/api/cards/predictions`, and `/api/db/horse/{horse}`. No FastAPI changes required for these features.

For the reference Fairview meeting, choose `2026-10-18` and **TAB Fairview**; club code comes from the meeting API. Do not guess codes. The screenshot-style reference race is Race 7.
