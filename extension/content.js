/**
 * A single "★ Save to Kaam Se Kaam" pill on any recognised job page. It reads
 * the job you're currently viewing and saves it — one at a time, on your click.
 *
 * extractors.js runs in this same isolated world (see manifest content_scripts)
 * and exposes window.__ksk_extract. We call it directly — no <script> injection
 * into the page, which LinkedIn's CSP blocks.
 */
(function () {
  if (window.__ksk_injected) return;
  window.__ksk_injected = true;

  const savePill = document.createElement("button");
  savePill.textContent = "★ Save to Kaam Se Kaam";
  Object.assign(savePill.style, {
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

  const setState = (text, bg) => {
    savePill.textContent = text;
    savePill.style.background = bg || "#f5a623";
  };
  const safe = (fn) => {
    try {
      return fn();
    } catch (e) {
      return null;
    }
  };

  savePill.addEventListener("click", () => {
    setState("Reading page…", "#c9c2b6");
    const payload = safe(() => window.__ksk_extract && window.__ksk_extract());
    if (!payload || !payload.title || (payload.description || "").length < 90) {
      setState("Can't read the full text — open the job's own page", "#e5484d");
      setTimeout(() => setState("★ Save to Kaam Se Kaam"), 3200);
      return;
    }
    setState("Saving…", "#c9c2b6");
    chrome.runtime.sendMessage({ type: "capture", payload }, (res) => {
      if (res && res.ok) {
        setState(
          res.score != null ? `Saved · ${res.score}% match` : "Saved ✓",
          "#46a758"
        );
      } else {
        setState((res && res.error) || "Save failed — sign in first", "#e5484d");
      }
      setTimeout(() => setState("★ Save to Kaam Se Kaam"), 3500);
    });
  });

  const mount = () => document.body && document.body.appendChild(savePill);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
