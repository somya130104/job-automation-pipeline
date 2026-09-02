# Kaam Se Kaam — job hunt automator

A personal job aggregator, resume matcher and application tracker. Pulls real
postings off public ATS boards, scores them against your resume, and tracks
every application from saved to offer.

**Phase 1 (MVP) is complete and running.** Phases 2–4 from the concept doc are
scaffolded behind interfaces but not implemented.

---

## Quick start

```bash
npm install
cp .env.example .env      # defaults work as-is; no API keys needed
npm run db:push           # create the SQLite schema
npm run db:seed           # create the local user + pull ~1,400 real jobs
npm run dev               # http://localhost:3000
```

Then open <http://localhost:3000/onboarding>, upload a resume, and the feed
fills in.

There is **no login wall by default** — see [Auth](#auth) below.

---

## What actually works

| Area | Status |
|---|---|
| Landing page, 3 theme skins, live ticker/dock | ✅ |
| Resume upload (PDF / DOCX / TXT) → structured parse | ✅ |
| ATS-readability check with actionable issues | ✅ |
| Ingestion from Greenhouse, Lever, Ashby, RemoteOK | ✅ live, no keys |
| Cross-source dedup + idempotent re-ingest | ✅ |
| Match scoring with explainable breakdown | ✅ |
| Job feed: search, filters, paging, detail sheet | ✅ |
| Keyword gap analysis + suggested bullets | ✅ |
| Outreach draft generator | ✅ (template-based) |
| Kanban tracker + JD snapshot + follow-up nudges | ✅ |
| Insights: ATS score, aggregate gaps, source health | ✅ |
| `/api/jobs/capture` endpoint for the extension | ✅ endpoint only |
| Browser extension | ⛔ Phase 3 |
| Email digest + cron | ⛔ Phase 3 (preference is stored) |
| Embeddings / pgvector semantic matching | ⛔ Phase 2 |
| Firecrawl career-page crawler | ⛔ Phase 3 |

---

## Data sources

Ingestion reads **public, no-auth JSON endpoints that employers publish so
their postings get syndicated**. This is intended use, not scraping.

```
Greenhouse  https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
Lever       https://api.lever.co/v0/postings/{token}?mode=json
Ashby       https://api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
RemoteOK    https://remoteok.com/api
```

Every adapter normalises to one `NormalizedJob` shape behind the `JobSource`
interface (`src/lib/sources/types.ts`), so adding a source is one file.

Boards polled by default live in `src/lib/sources/registry.ts`. Check they're
all still alive with:

```bash
npm run ingest -- --probe
```

### Deliberately not done

No LinkedIn or Naukri scraping, no stored credentials for them, no auto-submit
of applications, no harvesting of private recruiter contact details. Those get
accounts banned and are not worth it — the Phase 3 extension solves the same
problem via user-initiated capture of a page you're already viewing.

### Per-adapter quirks handled

Each of these was found by diffing against live responses, and each is
commented at the call site:

- **Greenhouse** returns `content` as **double-encoded** HTML (`&lt;p&gt;`), so
  entities are decoded before tags are stripped.
- **Lever** puts requirements in a separate `lists[]` array. Using
  `description` alone silently drops the bullets the keyword-gap feature needs
  most. `createdAt` is epoch **milliseconds**.
- **Ashby**'s `isRemote` is a trap — it's `true` for Hybrid roles too (all 89
  of Notion's Hybrid postings have `isRemote: true`). `workplaceType` is the
  field to trust. Compensation is a nested tier tree where only the `Salary`
  component is money; `EquityPercentage` components must not be read as salary.
  Intervals are spelled `"1 YEAR"`, not `PER_YEAR`.
- **RemoteOK**'s element 0 is a legal notice, not a job. `salary_min: 0` means
  "unstated", not "unpaid".

---

## Scoring

`src/lib/matching/score.ts`. Final score is a weighted blend of four
sub-scores, each stored on `MatchScore` so the UI can explain itself:

| Signal | Full-time weight | Internship weight |
|---|---|---|
| Keyword coverage | 0.45 | 0.52 |
| Title relevance | 0.25 | 0.26 |
| Experience fit | 0.20 | 0.05 |
| Location fit | 0.10 | 0.17 |

Weights live in `src/lib/matching/weights.ts`, never inline — Phase 2 tunes
them against a labelled eval set and that diff should be one file.

Two guards exist because the naive blend produced garbage rankings:

1. **Keyword confidence damping.** A JD naming only one or two recognisable
   skills would score 100% coverage on a single incidental hit. Observed:
   *"Senior Stock Administrator"* outranking real frontend roles for a frontend
   engineer. The ratio is now damped toward neutral below 6 recognised skills.
2. **Title relevance gate.** At a 0.25 weight, a totally unrelated role could
   still clear 70% on incidental keyword and location credit. A near-zero title
   match now multiplies the blend down rather than acting as just another term.

Internship mode uses a separate weight profile because years-of-experience is
close to meaningless as a signal for students, and the general profile
over-penalises them for it.

---

## Auth

Clerk is wired but **optional**.

- **Both keys blank** (default) → the app runs against a single local profile,
  no login wall. Good for local dev and demos.
- **Both keys set** → Clerk takes over automatically, same code paths, no code
  change. `ClerkProvider` and the server helpers are imported lazily precisely
  so the no-key path never loads Clerk's key validation.

See `src/lib/auth.ts`.

---

## Data model notes

SQLite has no scalar list columns, so every `string[]` in the concept doc is
stored as JSON text and read back through `src/lib/json-list.ts`. That's the
only place the encoding is allowed to leak.

Moving to Postgres/Supabase later = change `provider` in `prisma/schema.prisma`
and swap `DATABASE_URL`. Nothing else.

Two hashes matter:

- `fingerprint` = `hash(source + sourceToken + externalId)` — stable per
  listing, which is what makes re-ingestion idempotent.
- `dedupKey` = `hash(normalised title + normalised company)` — collapses the
  same role arriving from two different sources.

---

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run ingest       # poll every board once
npm run ingest -- --probe            # check every board responds, write nothing
npm run ingest -- --source=ashby     # one source
npm run ingest -- --token=stripe     # one board
npm run db:reset     # wipe + re-seed
```

`POST /api/ingest` does the same thing over HTTP, authenticated either by a
signed-in session or a `Bearer $CRON_SECRET` header — that's the hook the
Phase 3 daily cron will use.

`GET /api/health` reports per-source job counts, last run status and success
rate. It's rendered on the Insights page, because a board that quietly starts
404ing (companies do migrate ATS) otherwise just looks like "fewer jobs than
usual".

---

## Design

Retro-nostalgic-meets-corporate, after the Deluxe Salon reference: oversized
Anton display type, dark-glass pill chrome, warm amber on near-black, film
grain, hard offset shadows, a stamped "SENT / IN PLAY / OFFER" motif on tracker
cards, and a docked bottom-left Live Feed ticker in the reference's music
player slot.

Three skins ship — **Midnight Amber**, **Blueprint**, **Terminal** — driven
entirely by CSS custom properties on `[data-theme]`. An inline script in
`<head>` applies the saved theme before first paint so there's no flash of the
default skin.

---

## Known gaps

- Resume parsing is rule-based, not LLM-based, so it's tuned toward
  conventional single-column resumes. The onboarding confirm step exists
  because it *will* get some fields wrong. Swapping in an LLM is a
  one-function change — `parseResume` keeps its signature.
- Outreach drafts and bullet rewrites are templates, not generated prose.
- The "N job seekers hunting" counter is decorative ambience, not telemetry.
  It's seeded from the hour so server and client agree on first render.
- No test suite yet. The adapters are the obvious first thing to cover, against
  recorded fixture responses.
