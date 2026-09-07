# Kaam Se Kaam — browser extension

One click to save the job you're **already viewing** on LinkedIn, Naukri,
Wellfound, or any Greenhouse/Lever/Ashby/careers page into your tracker.

One pill, bottom-right — **★ Save to Kaam Se Kaam** — reads the posting open on
the page and `POST`s its title / company / location / description to
`/api/jobs/capture`. The pill then shows your match score.

This is not a scraper. It reads the DOM of the page in front of you, on your
click, in your own logged-in session. It never navigates between pages, clicks
"next", scrolls, or runs on its own. Same model as Teal, Huntr, Simplify.

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
| `content.js` | injects the pill, calls the extractor, sends to the worker |
| `extractors.js` | content-script #1 — per-site DOM extractor (`__ksk_extract`) + largest-text-block fallback |
| `background.js` | service worker; POSTs to `/api/jobs/capture`, stores recent list |
| `popup.html` / `popup.js` | set the app URL, view recent captures |

## Icons

`icons/icon128.png` is referenced by the manifest — drop any 128×128 PNG there
before publishing. Loading unpacked works without it (Chrome shows a default).
