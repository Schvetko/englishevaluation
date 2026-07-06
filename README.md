# English Assessment for IT Candidates

A Next.js (App Router) app that assesses candidates' spoken English:

- **/assessment** — the candidate flow: one random technical scenario + one everyday
  question, answered by voice (Web Speech API with a typed fallback), with video
  recording, a 5-minute reminder popup and a 7-minute hard limit per answer.
- **/api/evaluate** — server-side route that sends both transcripts to the Anthropic
  API and stores the structured evaluation (comprehension, fluency, technical
  vocabulary, everyday-vs-technical gap, overall band, observations, reformulation
  example) in Upstash Redis.
- **/results/[id]** — a candidate's result by direct link.
- **/admin** — table of all assessments, protected by `ADMIN_PASSWORD`.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Evaluation via the Anthropic API (server-side only) |
| `ADMIN_PASSWORD` | yes | Access to `/admin` |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | yes | Upstash Redis (Vercel Marketplace → Upstash). `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` also work |
| `BLOB_READ_WRITE_TOKEN` | for video | Vercel Blob storage for candidate video recordings |
| `TALENT_FLOW_WEBHOOK_URL` / `TALENT_FLOW_API_KEY` | optional | POSTs a JSON summary (name, band, result URL, video URLs) of each finished assessment to the talent-flow candidate database |

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

## Deploy (Vercel)

```bash
npx vercel deploy --prod
```

Then in the Vercel dashboard:

1. **Storage → Create → Upstash Redis** (free tier) — env vars are injected automatically.
2. **Storage → Create → Blob** — injects `BLOB_READ_WRITE_TOKEN` (needed for video).
3. **Settings → Environment Variables** — add `ANTHROPIC_API_KEY` and `ADMIN_PASSWORD`.
4. Redeploy.

## talent-flow integration

Videos are uploaded to Vercel Blob and their URLs are stored with each result and
shown on the result page. When `TALENT_FLOW_WEBHOOK_URL` is set, the app also
POSTs a JSON payload after every finished assessment:

```json
{
  "source": "english-assessment",
  "candidateName": "…",
  "assessmentId": "…",
  "resultUrl": "https://…/results/…",
  "band": "independent",
  "videoUrls": ["https://…blob…/videos/….webm"],
  "createdAt": "…"
}
```

Point it at an ingestion endpoint on https://talent-flow-ruddy.vercel.app/ to sync
candidates and videos into the candidate database.
