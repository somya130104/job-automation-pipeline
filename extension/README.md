# Kaam Se Kaam — browser extension

One-click capture of a job you're **already viewing** on LinkedIn, Naukri,
Wellfound, or any Greenhouse/Lever/Ashby/careers page, into your tracker.

This is not a scraper. It reads the DOM of the page in front of you when you
click the pill, and POSTs the visible title / company / description to the
app's `/api/jobs/capture` endpoint. It never navigates, paginates, logs in on
your behalf, or runs without a click. Same model as Teal, Huntr, Simplify.

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
| `content.js` | injects the pill, orchestrates a capture |
| `extractors.js` | per-site DOM field extractors (+ largest-text-block fallback) |
| `background.js` | service worker; POSTs to `/api/jobs/capture`, stores recent list |
| `popup.html` / `popup.js` | set the app URL, view recent captures |

## Icons

`icons/icon128.png` is referenced by the manifest — drop any 128×128 PNG there
before publishing. Loading unpacked works without it (Chrome shows a default).
