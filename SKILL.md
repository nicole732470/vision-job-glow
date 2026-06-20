---
name: joblens-web
description: >-
  Use when building, redesigning, debugging, or shipping the JobLens web app
  (vision-job-glow). Keeps UI, API calls, auth, and candidate profile schema
  aligned with the production EC2 backend. Do not use for the Chrome extension
  (that lives in nicole732470/joblens).
---

# JobLens web — Lovable project skill

JobLens helps job seekers **see a company before they apply**: paste a job URL, get an evidence-based **Apply / Near apply / Consider / Skip** verdict, plus H-1B sponsorship signal and resume fit.

This repo (`vision-job-glow`) is the **production web UI**. Backend + Chrome extension live in [`nicole732470/joblens`](https://github.com/nicole732470/joblens).

## Live stack

| Piece | Value |
|-------|--------|
| Web | This Lovable project → Publish → `*.lovable.app` |
| API | `VITE_API_URL=http://3.128.164.130:8000` (no trailing slash) |
| Auth storage | `localStorage`: `joblens_token`, `joblens_email` |

## API endpoints (do not rename paths)

- `POST /auth/register` — `{ email, password }`
- `POST /auth/login` — `{ email, password }`
- `GET /me/profile` — Bearer token
- `PUT /me/profile` — Bearer token, full `CandidateProfile` JSON
- `POST /jobs/parse-url` — `{ url }`
- `POST /resume/upload` — multipart PDF, Bearer token
- `POST /analyze` — `{ jd_text, company?, title?, job_url? }`, Bearer optional

Guest users can analyze without login. Logged-in users get saved profile + stored resume.

## Profile schema (must match backend)

```json
{
  "tracks": [{ "id", "label", "priority": 1-5, "example_titles": [] }],
  "avoid_tracks": [{ "id", "label", "example_titles": [] }],
  "locations": { "summary", "tier_1", "tier_2", "tier_3", "remote_ok", "relocation_ok" },
  "trajectory": ["string"],
  "dealbreakers": ["string"],
  "preferences": ["string"],
  "technical_penalties": ["string"],
  "alumni_schools": ["string"],
  "constraints": { "needs_sponsorship": true }
}
```

Onboarding is **once** at register/login — not a multi-step wizard on every visit.

## Design rules (keep unless user asks to change)

- Notion-adjacent warm palette: text `#37352f`, borders `#ece9e1`, page gradient peach/lavender
- Hero: large URL bar + charcoal primary button `#37352f`
- Verdict pills: rounded-full with soft ring (apply green, near blue, consider yellow, skip red)
- Wordmark **JobLens** only — no JL monogram, no navy header bar
- Results flow **below** the hero input (single-page guest flow)

Main UI: `src/routes/index.tsx`

## LinkedIn job URLs

Always **try** `POST /jobs/parse-url` first when the user pasted a URL and JD text is short.

If parse returns `ok: false` (LinkedIn often blocks server fetch) or the request fails:

1. Open the JD paste box (`setShowPaste(true)`)
2. Show the server `reason` or a short fallback message
3. User pastes JD → `POST /analyze` continues

Do **not** skip parse-url upfront just because the URL is LinkedIn.

**Chrome extension** still reads LinkedIn pages directly — best surface for LinkedIn jobs.

## HTTPS web → HTTP API

Lovable is HTTPS; EC2 API is HTTP. Browser blocks direct `fetch` (mixed content).

- Browser calls same-origin `/api/*`
- Server route `src/routes/api/$.tsx` proxies to `VITE_API_URL` / `JOBLENS_API_URL`

Do not point client-side `fetch` at `http://3.128.164.130:8000` from the browser.

- Do not point API at localhost in production env
- Do not break CORS assumptions (HTTPS Lovable → HTTP EC2 is OK)
- Do not simplify profile to fixed track chips — users define their own tracks
- Do not force resume upload before analyze
- Do not rewrite published git history (see `AGENTS.md`)

## LinkedIn showcase (for the human, not this skill)

SKILL.md teaches **Lovable how to code**. It does **not** appear on your LinkedIn profile.

To showcase the site on LinkedIn, use the copy in [linkedin-portfolio.md](linkedin-portfolio.md): Featured link, About blurb, and post templates. Put your **Publish URL** (`https://….lovable.app`) in LinkedIn Featured → Links.

LinkedIn ↔ Lovable **connector** only lets an app **post to your feed** or read your profile — it does not embed the website on your profile page.

## Quick commands in chat

```
/joblens-web Keep current design. Add [feature]. Do not change API paths or profile schema.
```

```
/joblens-web Redesign the results cards only — same API and auth flow.
```
