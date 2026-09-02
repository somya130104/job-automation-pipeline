/**
 * Injects a small "Save to Kaam Se Kaam" pill on any recognised job page.
 * The pill only appears; it does nothing until clicked.
 */
(function () {
  if (window.__ksk_injected) return;
  window.__ksk_injected = true;

  // Load the extractors into the page context.
  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("extractors.js");
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);

  const pill = document.createElement("button");
  pill.textContent = "★ Save to Kaam Se Kaam";
  Object.assign(pill.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 2147483647,
    padding: "10px 16px",
    borderRadius: "999px",
    border: "2px solid #0c0a09",
    background: "#f5a623",
    color: "#0c0a09",
    font: "700 13px/1 -apple-system, Segoe UI, Roboto, sans-serif",
    boxShadow: "0 4px 0 #0c0a09",
    cursor: "pointer",
  });

  function setState(text, bg) {
    pill.textContent = text;
    pill.style.background = bg || "#f5a623";
  }

  pill.addEventListener("click", async () => {
    setState("Reading page…", "#c9c2b6");
    // Ask the page-context extractor to run.
    const payload = await new Promise((resolve) => {
      const handler = (e) => {
        if (e.source === window && e.data?.__ksk_payload) {
          window.removeEventListener("message", handler);
          resolve(e.data.__ksk_payload);
        }
      };
      window.addEventListener("message", handler);
      const runner = document.createElement("script");
      runner.textContent =
        "window.postMessage({ __ksk_payload: window.__ksk_extract && window.__ksk_extract() }, '*');";
      document.documentElement.appendChild(runner);
      runner.remove();
      setTimeout(() => resolve(null), 2000);
    });

    if (!payload || !payload.description || payload.description.length < 120) {
      setState("Couldn't read this page", "#e5484d");
      setTimeout(() => setState("★ Save to Kaam Se Kaam"), 2500);
      return;
    }

    setState("Saving…", "#c9c2b6");
    chrome.runtime.sendMessage({ type: "capture", payload }, (res) => {
      if (res?.ok) {
        setState(
          res.score != null ? `Saved · ${res.score}% match` : "Saved ✓",
          "#46a758"
        );
      } else {
        setState(res?.error || "Save failed — sign in first", "#e5484d");
      }
      setTimeout(() => setState("★ Save to Kaam Se Kaam"), 3500);
    });
  });

  const mount = () => document.body && document.body.appendChild(pill);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
