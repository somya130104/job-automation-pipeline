# Kaam Se Kaam — browser extension

One-click capture of a job you're **already viewing** on LinkedIn, Naukri,
Wellfound, or any Greenhouse/Lever/Ashby/careers page, into your tracker.

Two pills, bottom-right:

- **★ Save to Kaam Se Kaam** — the single posting you're on, full description →
  `POST /api/jobs/capture`.
- **⇊ Capture all on this page** — every job card on a LinkedIn or Naukri
  **search-results** page (title / company / location / short teaser + permalink)
  → `POST /api/jobs/capture/batch`. LinkedIn keeps only ~7 cards in the DOM at a
  time, so on click this steps the results list down one screen at a time,
  reading what's rendered at each stop and merging by URL, then restores your
  scroll position. The app pads the thin teaser when scoring; open the good
  matches and use **★ Save** for the full JD.

This is not a scraper. It reads the DOM of the page in front of you, on your
click, in your own logged-in session. It never navigates between pages,
clicks "next", or runs on its own — the only thing it moves is the results
list's own scrollbar, to load the cards you're about to capture. Same model
as Teal, Huntr, Simplify.

The extractors run in the content-script isolated world (they only need the
page's DOM, not its JavaScript), so nothing is injected into the page itself —
sites with a strict Content-Security-Policy, LinkedIn included, are fine.

## Load it (Chrome / Edge / Brave)

1. Run the main app (`npm run dev`) and sign in.
2. Go to `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → select this `extension/` folder.
4. Click the extension icon → set **App URL** (default `http://localhost:3000`,
   or your deployed origin) → **Save**.
5. Open any job posting. Click the amber **★ Save to Kaam Se Kaam** pill
   bottom-right. The pill shows the match score once saved.

## How auth works

The extension calls the app with `credentials: "include"`, so it rides your
existing signed-in session cookie for the app origin. If you're not signed in,
the capture fails with a clear message — open the app, sign in, try again.

## Files

| file | role |
|---|---|
| `manifest.json` | MV3 manifest, host permissions, content-script matches |
| `content.js` | injects both pills, calls the extractors, sends to the worker |
| `extractors.js` | content-script #1 — per-site DOM extractors, single (`__ksk_extract`) and list (`__ksk_extract_list`), + largest-text-block fallback |
| `background.js` | service worker; POSTs to `/api/jobs/capture` and `/capture/batch`, stores recent list |
| `popup.html` / `popup.js` | set the app URL, view recent captures |

## Icons

`icons/icon128.png` is referenced by the manifest — drop any 128×128 PNG there
before publishing. Loading unpacked works without it (Chrome shows a default).
