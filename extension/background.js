/**
 * Service worker: forwards captured jobs to the app's /api/jobs/capture
 * endpoint. Uses cookie auth (credentials:'include') against the app origin —
 * the user just needs to be signed into the app in a normal tab. The extension
 * never stores credentials.
 */
const DEFAULT_ORIGIN = "http://localhost:3000";

async function appOrigin() {
  const { appOrigin } = await chrome.storage.sync.get("appOrigin");
  return (appOrigin || DEFAULT_ORIGIN).replace(/\/$/, "");
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== "capture") return;
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
      const recent = (await chrome.storage.local.get("recent")).recent || [];
      recent.unshift({
        title: msg.payload.title,
        company: msg.payload.company,
        score: data.score,
        at: Date.now(),
      });
      await chrome.storage.local.set({ recent: recent.slice(0, 20) });
      sendResponse({ ok: true, score: data.score, appUrl: `${(await appOrigin())}${data.appUrl || ""}` });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
    }
  })();
  return true; // async response
});
