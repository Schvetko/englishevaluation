# English Speaking Assessment

Web app for evaluating spoken English of IT hiring candidates.

**Stack:** Node.js + Express, vanilla HTML/JS frontend, SQLite (better-sqlite3), Anthropic API for evaluation.

## How it works

1. **`/assessment`** — the candidate answers two questions out loud (Web Speech API, `en-US`), with a typed-text fallback for unsupported browsers:
   - **Question 1 (technical):** a random scenario — explain a bug, an incident, an architecture, a trade-off, or the last feature they built. Up to 5 minutes of preparation time before answering.
   - **Question 2 (everyday):** a simple general question (weekends, motivation, hobbies) — used to compare whether fluency drops specifically on technical content.
   - Each answer: reminder popup at 5 minutes, hard stop at 7 minutes.
   - After both answers the candidate enters their name and submits.
2. **`POST /api/evaluate`** — server-side call to the Anthropic API (`claude-opus-4-8`) with a structured-output rubric: comprehension, fluency, technical vocabulary (Q1 only), everyday-vs-technical gap, overall band (`independent` / `supported` / `needs_support`), 2–3 concrete observations with reformulation examples. The result is stored in SQLite with a unique ID.
3. **`/results/:id`** — the candidate's result by direct link.
4. **`/admin`** — table of all assessments (name, date, band, link). Protected by HTTP Basic Auth (`ADMIN_PASSWORD`, any username).

## Running

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY and ADMIN_PASSWORD
npm start              # http://localhost:3000
```

Environment variables:

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Anthropic API key (server-side only) |
| `ADMIN_PASSWORD` | yes | Password for `/admin` |
| `PORT` | no | Default `3000` |
| `DB_PATH` | no | SQLite file path, default `./data/assessments.db` |

## Deployment notes

SQLite needs a persistent disk, so serverless platforms (Vercel/Netlify functions) are **not** suitable for this stack. Good options:

- **Railway / Render / Fly.io** — deploy as a Node service, attach a persistent volume, set `DB_PATH` to the volume.
- **Any VPS** — `npm install && npm start` behind nginx/caddy.

The Web Speech API requires HTTPS (except on `localhost`) and works best in Chrome/Edge. On unsupported browsers the app automatically falls back to typed input.

## Not yet implemented

- Video recording / upload to the talent-flow candidate database — needs the talent-flow API details (endpoint, auth, format).
