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
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The results list on LinkedIn (and long Naukri pages) only keeps ~7 cards in
  // the DOM at once — the rest render as you scroll. To capture the whole page
  // we step through the scroll container, reading what's rendered at each stop
  // and merging by URL, then put the scroll position back. Still only your
  // click, your session, your page — no navigation, no pagination.
  function findScroller() {
    const anchor = document.querySelector('a[href*="/jobs/view/"], a.title[href]');
    let el = anchor && anchor.parentElement;
    while (el && el !== document.body) {
      const s = getComputedStyle(el);
      if (
        (s.overflowY === "auto" || s.overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight + 120
      ) {
        return el;
      }
      el = el.parentElement;
    }
    return null; // fall back to window scroll
  }

  async function collectAll(setBusy) {
    const acc = new Map();
    let site = "";
    const grab = () => {
      const o = safe(() => window.__ksk_extract_list && window.__ksk_extract_list());
      if (o && o.site) site = o.site;
      for (const it of (o && o.items) || []) if (it.url) acc.set(it.url, it);
    };

    grab();
    const scroller = findScroller();
    const target = scroller || document.scrollingElement || document.documentElement;
    const startTop = target.scrollTop;
    const step = (scroller ? scroller.clientHeight : window.innerHeight) * 0.8;
    let lastCount = -1;
    let stagnant = 0;

    for (let i = 0; i < 40 && stagnant < 3; i++) {
      target.scrollTo(0, target.scrollTop + step);
      await sleep(350);
      grab();
      if (setBusy) setBusy(`Scanning… ${acc.size} found`);
      if (acc.size === lastCount) stagnant++;
      else stagnant = 0;
      lastCount = acc.size;
      if (target.scrollTop + target.clientHeight >= target.scrollHeight - 4) {
        grab();
        break;
      }
    }
    target.scrollTo(0, startTop);
    return { site, items: [...acc.values()] };
  }

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
  let batchRunning = false;
  batchPill.addEventListener("click", async () => {
    if (batchRunning) return;
    batchRunning = true;
    setState(batchPill, "Scanning list…", "#c9c2b6");

    let out;
    try {
      out = await collectAll((msg) => setState(batchPill, msg, "#c9c2b6"));
    } finally {
      batchRunning = false;
    }
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
          const already = res.saved - res.created;
          setState(
            batchPill,
            `Sent ${res.saved} · ${res.created} new` +
              (already > 0 ? `, ${already} already saved` : ""),
            "#46a758"
          );
        } else {
          setState(
            batchPill,
            (res && res.error) || "Save failed — sign in first",
            "#e5484d"
          );
        }
        setTimeout(() => setState(batchPill, "⇊ Capture all on this page"), 4500);
      }
    );
  });

  const mount = () => document.body && document.body.appendChild(wrap);
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
