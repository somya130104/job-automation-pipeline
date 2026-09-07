# Kaam Se Kaam

A personal job-hunt engine: pulls real openings off public job boards, scores
every one against your résumé, lets you save LinkedIn/Naukri jobs from a browser
extension, tracks each application from *saved* to *offer*, and emails you a
daily digest of new matches.

**Live:** <https://job-automation-pipeline.vercel.app>
**Repo:** <https://github.com/somya130104/job-automation-pipeline>

---

## Contents

- [What it does](#what-it-does)
- [The browser extension](#the-browser-extension)
- [Getting the most out of it](#getting-the-most-out-of-it)
- [Stack](#stack)
- [Local setup](#local-setup)
- [Data sources](#data-sources)
- [Scoring](#scoring)
- [Résumé / ATS check](#résumé--ats-check)
- [Job expiry](#job-expiry)
- [Automation (cron)](#automation-cron)
- [Auth](#auth)
- [Scripts](#scripts)
- [Deploying your own](#deploying-your-own)
- [Scaling & free-tier limits](#scaling--free-tier-limits)

---

## What it does

| Feature | Notes |
|---|---|
| **Job aggregation** | Polls ~40 company boards (Greenhouse / Lever / Ashby / SmartRecruiters / Recruitee / Workable) + whole-market feeds (RemoteOK, Remotive, Arbeitnow, Adzuna) + HN "Who is hiring?" + your followed companies. No auth, no scraping — these are feeds employers publish for syndication. India-weighted default list. |
| **Y Combinator companies** | Pull recent YC batches → auto-discover each company's job board → poll it like any other. Companies with no detectable board can be read once via Firecrawl (careers page → Markdown, credit-paranoid). |
| **Résumé parsing** | PDF / DOCX / TXT → structured skills, experience, education. Rule-based parser with a Gemini field-extraction pass on top. |
| **ATS check** | Strict résumé readability + writing-quality score (parseability, quantified bullets, verb strength & variety, clichés, pronouns, extraction noise) plus a Gemini review layer. Calibrated so a clean-but-average résumé lands in the 70s–low 80s, not 100. |
| **Match scoring** | Weighted blend of semantic similarity, keyword coverage, title relevance, experience fit and location fit — each sub-score stored and shown so the feed explains itself. Keyword coverage is category-weighted: hard tools/languages count full, engineering practices half, soft-skill boilerplate ("Communication", "Collaboration") almost nothing. |
| **Feed** | Search, filters (location type / role type / source / min score), "Best match" vs "Newest" sort, paging, per-job detail sheet with description / keyword gaps / suggested bullets / outreach draft. A **Job boards / Captured** toggle keeps extension captures out of the main feed. |
| **Semantic matching** | Gemini `gemini-embedding-001` (768-dim), cosine in JS. Falls back to keyword-only cleanly when embeddings aren't available — the scorer redistributes the weight so the number stays sensible. |
| **Scam heuristic** | Flags remote/internship listings with the usual red flags (fee requests, wildly off comp, personal-email applies…). |
| **Application tracker** | Kanban board — *Saved → Applied → Interviewing → Offer / Rejected*. Snapshots the JD at save time, nudges follow-ups after a week. |
| **Outreach drafts** | Template cold-email / connection-note per job. The app never sends anything — you copy and send from your own account. |
| **Insights** | Your ATS score, aggregate skill gaps across your feed, and per-source ingestion health. |
| **Recap** | Weekly activity summary, shareable. |
| **Daily digest** | 8:00 AM IST email of new matches above your threshold. Nothing sent on a zero-match day. One-click unsubscribe. |
| **Browser extension** | One click to save the LinkedIn / Naukri / Wellfound / careers-page job you're viewing. See below. |

---

## The browser extension

`extension/` — a Manifest V3 extension for Chrome / Edge / Brave. It adds one
button, **★ Save to Kaam Se Kaam**, bottom-right of any recognised job page. On
click it reads the job open in front of you (title, company, location,
description) and `POST`s it to `/api/jobs/capture`; the button then shows your
match score.

It is **not a scraper**: it reads the DOM of the page you're already viewing, on
your click, in your own logged-in session. It never navigates, paginates,
scrolls, or runs on its own. Captured jobs land under the **Captured** tab in
the feed, scored like everything else.

### Install it (yourself)

1. `chrome://extensions` → turn on **Developer mode** (top-right).
2. **Load unpacked** → select the `extension/` folder.
3. Click the puzzle-piece icon → pin **Kaam Se Kaam** → click it → set **App
   URL** to `https://job-automation-pipeline.vercel.app` → **Save**.
4. Make sure you're signed into that URL in a normal tab (the extension rides
   your session cookie — it stores no credentials).
5. Open any job posting, click the amber pill.

### Share it with someone

The extension isn't on the Chrome Web Store, so send them the files + these
steps:

- **Easiest:** on the GitHub repo, **Code → Download ZIP**, unzip, and Load
  unpacked the `extension/` folder inside. (Or `git clone` the repo.)
- **Or** zip just the `extension/` directory and send that.
- They then do steps 1–5 above, pointing **App URL** at your deployed origin.
- Each person needs their own account on the app (Clerk sign-in) — the
  extension saves into whichever account that browser is signed into.

To make install one-click for non-technical friends, publish it to the Chrome
Web Store (one-time \$5 developer fee, a few days' review). Overkill for a
handful of people.

### Updating it

After any change to files in `extension/`, everyone reloads it: `chrome://extensions`
→ ↻ on the card. The version in `manifest.json` (currently **0.4.0**) is how you
confirm the new copy loaded.

---

## Getting the most out of it

1. **Upload your résumé** at `/onboarding` and fix anything the parser got wrong
   on the confirm step — every score downstream depends on it.
2. **Set targeting** — role type, target roles, locations, years, remote-only.
   Changing any of these rescopes the whole feed.
3. **Tune the digest threshold** in Settings. Default is 25; if few new jobs
   clear it, lower it. The digest only sends jobs at or above this score.
4. **Follow companies** you care about in Settings → they get polled every
   ingest. Hit **Pull recent Y Combinator batches**, then **Resolve pending**
   a few times to drain the discovery queue — that's what actually gets YC
   openings into your feed.
5. **Install the extension** for LinkedIn/Naukri roles the boards don't carry.
6. **Refresh jobs** from the feed any time, or let the daily cron do it.
7. **Work the tracker** — save promising roles, mark applied, let the follow-up
   nudges keep you honest.

---

## Stack

- **Next.js 15** (App Router) + **React 19**
- **Prisma** ORM → **PostgreSQL** (Neon; pooled `DATABASE_URL` + unpooled `DIRECT_URL`)
- **Clerk** auth (optional — see [Auth](#auth))
- **Gemini** API for embeddings, résumé field extraction, ATS review, HN parsing, career-page extraction — every use has a deterministic fallback for when the key is absent or rate-limited
- **Resend** for digest email
- **Firecrawl** (free tier, markdown-only) for career-page discovery
- **Tailwind CSS**, **framer-motion**
- **Vitest** + a scorer eval harness, gated in CI
- Deployed on **Vercel**; two **GitHub Actions** crons

---

## Local setup

```bash
npm install
cp .env.example .env        # runs keyless against a local SQLite-style flow for dev
npm run db:push             # create the schema
npm run db:seed             # local user + a first batch of real jobs
npm run dev                 # http://localhost:3000
```

Open <http://localhost:3000/onboarding>, upload a résumé, and the feed fills in.
There is **no login wall** until you add Clerk keys.

`.env` keys (all optional except the DB for a non-SQLite setup):

```
DATABASE_URL / DIRECT_URL            Postgres (Neon). Omit for the local dev flow.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    } add BOTH to switch on real multi-user auth
CLERK_SECRET_KEY                     }
GEMINI_API_KEY                       embeddings + résumé/ATS/HN LLM calls
RESEND_API_KEY / DIGEST_FROM         digest email (needs a verified Resend domain
                                     to send to anyone but your own address)
ADZUNA_APP_ID / ADZUNA_APP_KEY       Adzuna source + salary panel
FIRECRAWL_API_KEY                    career-page discovery / crawl
CRON_SECRET                          bearer token the GitHub Actions crons use
APP_ORIGIN                           deployed origin, for digest deep links
```

---

## Data sources

Ingestion reads **public, no-auth JSON endpoints employers publish so their
postings get syndicated** — intended use, not scraping.

```
Greenhouse       boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
Lever            api.lever.co/v0/postings/{token}?mode=json
Ashby            api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true
SmartRecruiters  api.smartrecruiters.com/v1/companies/{token}/postings
Recruitee        {token}.recruitee.com/api/offers
Workable         apply.workable.com/api/v1/widget/accounts/{token}
RemoteOK         remoteok.com/api
Remotive         remotive.com/api/remote-jobs
Arbeitnow        arbeitnow.com/api/job-board-api
Adzuna           api.adzuna.com/v1/api/jobs/{country}/search   (key)
```

Every adapter normalises to one `NormalizedJob` shape behind the `JobSource`
interface (`src/lib/sources/types.ts`); adding a source is one file. Default
boards live in `src/lib/sources/registry.ts` — probe them with
`npm run ingest -- --probe`.

**Deliberately not done:** no LinkedIn / Naukri server-side scraping, no stored
credentials for them, no auto-submit of applications, no harvesting of private
recruiter contacts. The extension solves the LinkedIn/Naukri case via
user-initiated capture of a page you're already on.

Two hashes make re-ingestion safe:

- `fingerprint = hash(source + sourceToken + externalId)` — stable per listing → idempotent re-ingest.
- `dedupKey = hash(normalised title + normalised company)` — collapses the same role arriving from two sources (ATS record beats aggregator record).

---

## Scoring

`src/lib/matching/score.ts`. Final score is a weighted blend, each sub-score
stored on `MatchScore` so the UI can explain itself:

| Signal | Full-time | Internship |
|---|---|---|
| Semantic similarity | 0.30 | 0.34 |
| Keyword coverage | 0.30 | 0.32 |
| Title relevance | 0.20 | 0.20 |
| Experience fit | 0.12 | 0.02 |
| Location fit | 0.08 | 0.12 |

Weights live in `src/lib/matching/weights.ts` (never inline — the eval harness
tunes them and that diff should be one file).

**Keyword coverage is category-weighted.** A JD's skills are scored
`Σ(weight of matched) / Σ(weight of JD skills)`, where hard tools/languages =
1.0, engineering practices (System Design, Testing, Security) = 0.5, and
soft-skill boilerplate (Communication, Collaboration, Ownership…) = 0.15. So
missing "Kafka" costs you; missing "Collaboration" barely does. The "You're
missing" chips drop soft skills entirely and list hard tools first.

Guards that exist because the naïve blend produced garbage:

1. **Keyword confidence damping** — a JD naming only one or two recognisable
   skills would otherwise score 100% on one incidental hit (*"Senior Stock
   Administrator"* outranking real roles). Damped toward neutral below a
   weighted-demand threshold.
2. **Title relevance gate** — a near-zero title match multiplies the whole
   blend down rather than acting as just another weighted term.
3. **Role-type filter** — a student hunting internships doesn't want senior
   roles at 70%, so a full-time/intern mismatch multiplies the blend down hard.

Semantic similarity uses Gemini embeddings; when a job has no embedding yet the
scorer runs keyword-only and redistributes the semantic weight.

There's a real eval harness: `npm run eval` ranks the scorer over a
hand-labelled fixture and prints precision@10 / recall@10 / separation. CI
fails the build if precision@10 drops below 70%.

---

## Résumé / ATS check

`src/lib/resume/ats-check.ts` (rule engine) + `ats-llm.ts` (Gemini review),
blended in `mergeAts`.

The rule engine scores parseability (contact fields, section detection, date
parsing, two-column / icon-glyph extraction noise) **and** writing quality
(quantified-bullet ratio, strong-verb ratio, verb variety across the whole
document, weak openers, clichés, first-person pronouns, vague quantifiers,
passive voice, bullet length, skills count). Hard ceilings apply: the rule
engine alone never exceeds **88**, a non-polished résumé caps at **82**, and any
weak-opener/cliché/pronoun flaw caps at **74**. Anything higher needs the Gemini
pass to agree. Section detection is keyword-based, so "EDUCATIONAL
QUALIFICATIONS" / "INTERNSHIP EXPERIENCES" resolve correctly.

---

## Job expiry

`src/lib/sources/cleanup.ts`, run at the end of every full ingest.
"Is this still open?" isn't a date question, so, strongest signal first:

1. **Vanished from its board** — every posting we see in an ingest bumps
   `Job.lastSeenAt`. A board job not re-seen in 3 days (2 daily runs + grace) is
   off the board → archived.
2. **Deadline passed** — `applicationDeadline < now`, any source.
3. **Age backstop** — `lastSeenAt` past a per-source TTL (boards 45d, aggregator
   feeds 21d, HN 35d, career-page 30d, captures 45d).

The clock is `lastSeenAt`, never `postedAt` — `postedAt` would delete a role the
day after we discover it and kill legitimately long-open senior roles. Archived
jobs are hidden from the feed/digest but kept for the Tracker, Recap and dedup
history; their `MatchScore` rows are dropped (that's `jobs × users`, the real
DB growth). Jobs archived >60 days with no application or digest-send are
hard-deleted.

---

## Automation (cron)

Two GitHub Actions (`.github/workflows/`), both hitting the deployed app with
`Authorization: Bearer $CRON_SECRET`:

| Workflow | Schedule | Does |
|---|---|---|
| `daily-ingest` | 02:00 UTC (7:30 AM IST) | polls every board, folds in HN, runs the expiry sweep, rescores every user |
| `daily-digest` | 02:30 UTC (8:00 AM IST) | emails each user their new matches above threshold |

Both accept a manual run from the repo's **Actions** tab. Needs repo secrets
`APP_ORIGIN` and `CRON_SECRET` (the latter matching the deployed env var).

---

## Auth

Clerk is wired but **optional**.

- **Both keys blank** → the app runs against a single local profile, no login
  wall. Good for local dev and demos.
- **Both keys set** → Clerk takes over automatically, same code paths.
  `ClerkProvider` and the server helpers are imported lazily so the no-key path
  never loads Clerk's validation. See `src/lib/auth.ts`.

---

## Scripts

```bash
npm run dev                          # dev server
npm run build                        # prisma generate + next build
npm run lint                         # eslint
npm test                             # vitest
npm run db:push                      # sync schema
npm run db:seed                      # local user + first jobs
npm run db:reset                     # wipe + re-seed
npm run ingest                       # poll every board once
npm run ingest -- --probe            # check every board responds, write nothing
npm run ingest -- --source=ashby     # one source
npm run embed                        # backfill job embeddings
npm run eval                         # scorer precision@10 / recall@10 report
npm run digest:run                   # build + send the digest now
```

`POST /api/ingest` and `POST /api/digest/run` do the same over HTTP, authed by a
signed-in session or the `CRON_SECRET` bearer. `GET /api/health` reports
per-source job counts, last-run status, success rate and the archived-jobs
count (rendered on Insights).

---

## Deploying your own

1. Push the repo to GitHub.
2. Import it into Vercel.
3. Add a Postgres database (Neon's Vercel integration sets `DATABASE_URL` /
   `DIRECT_URL` for you), then `npx prisma db push` against it.
4. Set the env vars from [Local setup](#local-setup) in the Vercel project.
5. Add repo secrets `APP_ORIGIN` + `CRON_SECRET` so the crons work.
6. For the digest to reach anyone but you, verify a domain in Resend.

---

## Scaling & free-tier limits

Healthy for **~10 users** on the all-free stack before something needs
changing. Concurrency (people browsing at once) is fine at 20–50; total user
count is the constraint. First things to bite:

| Limit | Caps at | Fix |
|---|---|---|
| **Resend** — domain required to email anyone but yourself | blocking for friends | verify a domain (~10 min) |
| **`/api/ingest` rescore loop** — re-scores every user sequentially in one 300s function | ~8–10 users | make rescoring incremental |
| **Gemini free tier** — ~15 req/min, ~1.5k/day; embeddings quota separate | ~15–20 users for résumé/ATS ops | enable billing, or accept keyword-only matching |
| **Neon free** — 0.5 GB storage, ~192 compute-hrs/mo, scale-to-zero cold starts | ~20–50 users | $19 tier, or `connection_limit=1` on the URL |
| **Clerk free** — 10,000 MAU | not at friends scale | — |
| **GitHub Actions** — unlimited on a public repo | never | — |

`getCurrentUser()` reads the user row on the hot path and only writes on first
sight, so a Neon cold start doesn't starve the connection pool.
