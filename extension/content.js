/**
 * "Save to Kaam Se Kaam" controls on any recognised job page.
 * The pills only appear; they do nothing until clicked.
 *
 *  ★  Save this job        — single posting, full description
 *  ⇊  Capture all on page  — every job card on a LinkedIn / Naukri results page
 *                            (short teasers; the app pads them when scoring)
 *
 * extractors.js runs in this same isolated world (see manifest content_scripts)
 * and exposes window.__ksk_extract / window.__ksk_extract_list. We call them
 * directly — no <script> injection into the page, which LinkedIn's CSP blocks.
 */
(function () {
  if (window.__ksk_injected) return;
  window.__ksk_injected = true;

  function mkPill(label) {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      display: "block",
      width: "100%",
      padding: "10px 16px",
      borderRadius: "999px",
      border: "2px solid #0c0a09",
      background: "#f5a623",
      color: "#0c0a09",
      font: "700 13px/1 -apple-system, Segoe UI, Roboto, sans-serif",
      boxShadow: "0 4px 0 #0c0a09",
      cursor: "pointer",
    });
    return b;
  }
  const setState = (el, text, bg) => {
    el.textContent = text;
    el.style.background = bg || "#f5a623";
  };

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 2147483647,
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    width: "220px",
  });

  const batchPill = mkPill("⇊ Capture all on this page");
  const savePill = mkPill("★ Save to Kaam Se Kaam");
  wrap.appendChild(batchPill);
  wrap.appendChild(savePill);

  const safe = (fn) => {
    try {
      return fn();
    } catch (e) {
      return null;
    }
  };

  // --- single job --------------------------------------------------------------
  savePill.addEventListener("click", () => {
    setState(savePill, "Reading page…", "#c9c2b6");
    const payload = safe(() => window.__ksk_extract && window.__ksk_extract());
    if (!payload || !payload.title || (payload.description || "").length < 90) {
      setState(savePill, "Can't read the full text — open the job's own page", "#e5484d");
      setTimeout(() => setState(savePill, "★ Save to Kaam Se Kaam"), 3200);
      return;
    }
    setState(savePill, "Saving…", "#c9c2b6");
    chrome.runtime.sendMessage({ type: "capture", payload }, (res) => {
      if (res && res.ok) {
        setState(
          savePill,
          res.score != null ? `Saved · ${res.score}% match` : "Saved ✓",
          "#46a758"
        );
      } else {
        setState(savePill, (res && res.error) || "Save failed — sign in first", "#e5484d");
      }
      setTimeout(() => setState(savePill, "★ Save to Kaam Se Kaam"), 3500);
    });
  });

  // --- whole results page ----------------------------------------------------
  batchPill.addEventListener("click", () => {
    setState(batchPill, "Reading list…", "#c9c2b6");
    const out = safe(() => window.__ksk_extract_list && window.__ksk_extract_list());
    const items = (out && out.items) || [];
    if (items.length === 0) {
      setState(batchPill, "No job list found here", "#e5484d");
      setTimeout(() => setState(batchPill, "⇊ Capture all on this page"), 2500);
      return;
    }
    setState(batchPill, `Saving ${items.length}…`, "#c9c2b6");
    chrome.runtime.sendMessage(
      { type: "captureBatch", site: out.site, payload: items },
      (res) => {
        if (res && res.ok) {
          setState(batchPill, `Saved ${res.saved} · ${res.created} new`, "#46a758");
        } else {
          setState(
            batchPill,
            (res && res.error) || "Save failed — sign in first",
            "#e5484d"
          );
        }
        setTimeout(() => setState(batchPill, "⇊ Capture all on this page"), 4000);
      }
    );
  });

  const mount = () => document.body && document.body.appendChild(wrap);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
