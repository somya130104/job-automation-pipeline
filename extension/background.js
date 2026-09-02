/**
 * Service worker: forwards captured jobs to the app's capture endpoints.
 * Uses cookie auth (credentials:'include') against the app origin — the user
 * just needs to be signed into the app in a normal tab. The extension never
 * stores credentials.
 */
const DEFAULT_ORIGIN = "http://localhost:3000";

async function appOrigin() {
  const { appOrigin } = await chrome.storage.sync.get("appOrigin");
  return (appOrigin || DEFAULT_ORIGIN).replace(/\/$/, "");
}

async function pushRecent(entries) {
  const recent = (await chrome.storage.local.get("recent")).recent || [];
  for (const e of entries) recent.unshift({ ...e, at: Date.now() });
  await chrome.storage.local.set({ recent: recent.slice(0, 20) });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "capture") {
    (async () => {
      try {
        const origin = await appOrigin();
        const res = await fetch(`${origin}/api/jobs/capture`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            url: msg.payload.url,
            title: msg.payload.title,
            company: msg.payload.company,
            description: msg.payload.description,
            location: msg.payload.location,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
          return;
        }
        await pushRecent([
          { title: msg.payload.title, company: msg.payload.company, score: data.score },
        ]);
        sendResponse({ ok: true, score: data.score });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    })();
    return true; // async response
  }

  if (msg.type === "captureBatch") {
    (async () => {
      try {
        const origin = await appOrigin();
        const res = await fetch(`${origin}/api/jobs/capture/batch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ site: msg.site, jobs: msg.payload }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          sendResponse({ ok: false, error: data.error || `HTTP ${res.status}` });
          return;
        }
        await pushRecent(
          msg.payload
            .slice(0, 5)
            .map((j) => ({ title: j.title, company: j.company, score: null }))
        );
        sendResponse({
          ok: true,
          saved: data.saved,
          created: data.created,
          skipped: data.skipped,
        });
      } catch (e) {
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      }
    })();
    return true;
  }
});
