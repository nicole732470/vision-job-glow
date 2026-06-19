# JobLens — LinkedIn showcase copy

Paste these on **LinkedIn** (not in SKILL.md). Replace `YOUR_LOVABLE_URL` with your Publish link from Lovable (e.g. `https://something.lovable.app`).

---

## Featured → Add link

**Title:** JobLens — See a company before you apply

**URL:** `YOUR_LOVABLE_URL`

**Description (optional):** AI job-fit analyzer: paste a posting, get Apply / Skip with H-1B and resume evidence.

---

## Featured → Add project (manual)

**Project name:** JobLens

**Description:**

Full-stack AI product I built for smarter job search:

- **Web app** (Lovable + React) — paste a job URL, get an evidence-based verdict in one page
- **Chrome extension** — H-1B sponsor lookup + fit panel on LinkedIn job posts
- **Backend** (FastAPI on AWS) — LangGraph agent, pgvector resume RAG, structured JD parsing

Stack: React, TanStack Start, FastAPI, PostgreSQL/pgvector, OpenRouter LLM, Docker on EC2.

**Link:** `YOUR_LOVABLE_URL`

---

## About section (one paragraph)

I build JobLens — a tool that helps you **see a company before you apply**. Paste a job link and get an Apply / Near / Consider / Skip verdict backed by H-1B filing data, resume fit, and your own job-search profile. Web: `YOUR_LOVABLE_URL` · Open source: github.com/nicole732470/joblens

---

## Post template (announce launch)

```
Shipped JobLens 🎯

Job searching on LinkedIn is noisy. I wanted one question answered before I apply: is this role actually a fit for *me*?

JobLens:
→ Paste a job URL
→ Checks H-1B sponsorship history
→ Matches the posting to your profile + resume
→ Gives a clear Apply / Skip recommendation with reasoning

Try the web app: YOUR_LOVABLE_URL
Chrome extension + API are open source: github.com/nicole732470/joblens

Built with Lovable (UI), FastAPI, LangGraph, and pgvector on AWS.

#AI #JobSearch #FullStack #BuildInPublic
```

---

## If you use Lovable → LinkedIn connector

That integration **publishes posts** to your feed (e.g. auto-post when you ship). It does **not** add a website preview to your profile header.

Workflow: connect LinkedIn in Lovable Connectors → ask in chat: *"Post to LinkedIn that I launched JobLens at YOUR_LOVABLE_URL"* — uses the post template above.

---

## Checklist

- [ ] Lovable → **Publish** → copy `*.lovable.app` URL
- [ ] LinkedIn profile → **Add profile section** → **Featured** → **Links** → paste URL
- [ ] Optional: paste About paragraph
- [ ] Optional: publish launch post (connector or manual)
