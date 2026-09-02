/**
 * Per-site DOM extractors. Each returns { title, company, description, location }
 * from the page the user is ALREADY viewing. This is user-initiated capture of
 * visible content — the same model Teal / Huntr / Simplify use — not scraping:
 * nothing here navigates, paginates, or runs without a click.
 */
(function () {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const textOf = (sel) => {
    const el = document.querySelector(sel);
    return el ? clean(el.innerText || el.textContent) : "";
  };
  const bigVisibleText = (root) => {
    // Fallback: the largest text block on the page is almost always the JD.
    let best = "";
    (root || document).querySelectorAll("main, article, section, div").forEach((el) => {
      const t = clean(el.innerText);
      if (t.length > best.length && t.length < 20000) best = t;
    });
    return best;
  };

  // LinkedIn's class names rotate constantly, so its extractors are built on
  // stable anchors (every card links to /jobs/view/<id>) and reconstruct the
  // company / location from the card's visible text lines instead.
  const LI_NOISE =
    /^(promoted|easy apply|be an early applicant|actively reviewing applicants|viewed|applicants?|see (all|how)|save|apply|share|·|\d+\s*(applicants?|connections?|company alumni|people clicked|school alumni)|responses managed|with verification|reposted|\d+\s*(hour|day|week|month)s?\s*ago)/i;

  const liDetailRoot = () =>
    document.querySelector(
      ".jobs-search__job-details--container, .jobs-details__main-content, .job-view-layout, .jobs-details"
    );

  function liCard(anchor) {
    let href = anchor.getAttribute("href") || "";
    if (href.startsWith("/")) href = "https://www.linkedin.com" + href;
    href = href.split("?")[0].split("#")[0];

    const card =
      anchor.closest("[data-occludable-job-id]") ||
      anchor.closest("li") ||
      anchor.closest("div.job-card-container") ||
      anchor.parentElement ||
      anchor;

    const hidden = anchor.querySelector('span[aria-hidden="true"]');
    const title = clean(
      (hidden && hidden.innerText) || anchor.getAttribute("aria-label") || anchor.innerText
    )
      .replace(/^view job:?\s*/i, "")
      .replace(/\s*(with verification|·.*)$/i, "");

    const pick = (sels) => {
      for (const s of sels) {
        const el = card.querySelector(s);
        const t = el && clean(el.innerText || el.textContent);
        if (t) return t;
      }
      return "";
    };

    // Company: the card logo's alt text is LinkedIn's most stable signal;
    // then known subtitle classes; then line reconstruction.
    let company = "";
    const logo = card.querySelector("img[alt]");
    if (logo) {
      company = clean(logo.getAttribute("alt")).replace(/\s+(company\s+)?logo$/i, "");
      if (/^(company|logo|)$/i.test(company)) company = "";
    }
    if (!company)
      company = pick([
        ".artdeco-entity-lockup__subtitle",
        ".job-card-container__primary-description",
        ".job-card-container__company-name",
        '[class*="subtitle"]',
      ]);

    let location = pick([
      ".artdeco-entity-lockup__caption",
      ".job-card-container__metadata-item",
      ".job-card-container__metadata-wrapper li",
      '[class*="metadata"] li',
      '[class*="caption"]',
    ]);

    let extra = "";
    if (!company || !location) {
      let lines = clean(card.innerText)
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      lines = lines.filter((l, i) => l !== lines[i - 1]); // a11y dupes
      lines = lines.filter((l) => !l.startsWith(title) && !LI_NOISE.test(l));
      if (!company) company = lines[0] || "";
      if (!location) location = lines[company === lines[0] ? 1 : 0] || "";
      extra = lines.slice(2).join(". ");
    }

    return { url: href, title, company, location, description: extra };
  }

  const EXTRACTORS = {
    "linkedin.com": () => {
      const root = liDetailRoot() || document;
      const pick = (sels) => {
        for (const s of sels.split(",")) {
          const el = root.querySelector(s.trim()) || document.querySelector(s.trim());
          const t = el && clean(el.innerText || el.textContent);
          if (t) return t;
        }
        return "";
      };
      let description = pick(
        "#job-details, .jobs-description__content .jobs-box__html-content, .jobs-description-content__text, .jobs-description__container, .jobs-box__html-content, article"
      );
      if (description.length < 160 && root !== document) {
        description = bigVisibleText(root) || description;
      }
      return {
        title: pick(
          ".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .topcard__title, h1"
        ),
        company: pick(
          ".job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name, .topcard__org-name-link, .artdeco-entity-lockup__subtitle"
        ),
        location: pick(
          ".job-details-jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .topcard__flavor--bullet"
        ),
        description,
      };
    },
    "naukri.com": () => ({
      title: textOf(".styles_jd-header-title__rZwM1, h1.jd-header-title, section.job-desc h1, h1"),
      company: textOf(
        ".styles_jd-header-comp-name__MvqAI a, .jd-header-comp-name a, .comp-name, .styles_jd-header-comp-name__MvqAI"
      ),
      location: textOf(".styles_jhc__location__W_pVs, .location, .styles_jhc__loc___Du2H"),
      description: textOf(
        ".styles_JDC__dang-inner-html__h0K4t, .dang-inner-html, .job-desc, section.job-desc"
      ),
    }),
    "wellfound.com": () => ({
      title: textOf('[data-test="JobTitle"], h1'),
      company: textOf('[data-test="JobDetailHeader-companyName"], [class*="companyName"], h2'),
      location: textOf('[data-test="LocationText"], [class*="location"]'),
      description: textOf('[data-test="JobDescription"], #job-description, [class*="description"]'),
    }),
    "greenhouse.io": () => ({
      title: textOf("h1.app-title, h1"),
      company: textOf(".company-name, #header .company-name") || clean(document.title.split(" at ").pop()),
      location: textOf(".location, .app-location"),
      description: textOf("#content, .content"),
    }),
    "lever.co": () => ({
      title: textOf(".posting-headline h2, h2"),
      company: clean((document.title.split(" - ")[0]) || location.hostname.split(".")[2] || ""),
      location: textOf(".posting-categories .location, .location"),
      description: textOf(".posting-page .section-wrapper, .content, .section-wrapper"),
    }),
    "ashbyhq.com": () => ({
      title: textOf("h1"),
      company: clean(document.title.split(" @ ").pop() || document.title.split(" - ").pop() || ""),
      location: textOf('[class*="location"]'),
      description: textOf('[class*="_descriptionText"], main'),
    }),
  };

  function hostKey() {
    const h = location.hostname.replace(/^www\./, "");
    return Object.keys(EXTRACTORS).find((k) => h === k || h.endsWith("." + k) || h.includes(k.split(".")[0]));
  }

  // --- List / search-results extractors -------------------------------------
  // Return every job card currently in the DOM on a results page. These carry
  // only a short teaser; the app pads the description when scoring. Still just
  // reading what the page already rendered — nothing paginates or scrolls.
  const attr = (el, sels) => {
    for (const s of sels) {
      const n = el.querySelector(s);
      const v = n && (n.getAttribute("href") || n.href);
      if (v) return v;
    }
    return "";
  };
  const inCard = (el, sels) => {
    for (const s of sels) {
      const n = el.querySelector(s);
      const t = n && clean(n.innerText || n.textContent);
      if (t) return t;
    }
    return "";
  };

  const LIST_EXTRACTORS = {
    "linkedin.com": () => {
      // One card can hold several /jobs/view/ links (title, logo, footer) —
      // keep the anchor with the most text per card.
      const cardMap = new Map();
      document.querySelectorAll('a[href*="/jobs/view/"]').forEach((a) => {
        const card =
          a.closest("li") ||
          a.closest("[data-occludable-job-id]") ||
          a.closest("[data-job-id]") ||
          a.closest("div.job-card-container") ||
          a.parentElement;
        if (!card) return;
        const weight = (a.getAttribute("aria-label") || a.innerText || "").length;
        const prev = cardMap.get(card);
        if (!prev || weight > prev.weight) cardMap.set(card, { a, weight });
      });
      return Array.from(cardMap.values()).map(({ a }) => liCard(a));
    },
    "naukri.com": () => {
      const cards = document.querySelectorAll(
        ".srp-jobtuple-wrapper, article.jobTuple, div.jobTuple, .cust-job-tuple"
      );
      return Array.from(cards).map((card) => {
        let href = attr(card, ["a.title", "a.title.ellipsis", 'a[href*="/job-listings-"]']);
        if (href && href.startsWith("/")) href = "https://www.naukri.com" + href;
        const exp = inCard(card, [".expwdth", ".exp-wrap .expwdth", "span.expwdth"]);
        const sal = inCard(card, [".sal-wrap span", "span.sal", ".salary"]);
        const desc = inCard(card, [".job-desc", "span.job-desc", ".job-description"]);
        return {
          url: (href || "").split("?")[0],
          title: inCard(card, ["a.title", ".title.ellipsis", "a.title.ellipsis"]),
          company: inCard(card, ["a.comp-name", ".comp-name", "a.subTitle", ".subTitle"]),
          location: inCard(card, [".locWdth", "span.locWdth", ".loc-wrap .locWdth", ".loc span"]),
          description: [desc, exp && `Experience: ${exp}`, sal && `Salary: ${sal}`]
            .filter(Boolean)
            .join(". "),
        };
      });
    },
  };

  window.__ksk_extract_list = function () {
    const key = hostKey();
    const fn = key && LIST_EXTRACTORS[key];
    if (!fn) return { site: key || location.hostname, items: [] };
    let raw = [];
    try {
      raw = fn() || [];
    } catch (e) {
      raw = [];
    }
    const seen = new Set();
    const items = [];
    for (const it of raw) {
      const url = (it.url || "").split("#")[0];
      if (!url || !it.title || seen.has(url)) continue;
      seen.add(url);
      items.push({
        url,
        title: clean(it.title),
        company: clean(it.company),
        location: clean(it.location),
        description: clean(it.description || "").slice(0, 4000),
      });
    }
    return { site: key ? key.replace(/\.com$/, "") : location.hostname, items };
  };

  window.__ksk_extract = function () {
    const key = hostKey();
    let data = key ? EXTRACTORS[key]() : {};
    if (!data.description || data.description.length < 90) {
      // On LinkedIn a whole-page scan grabs the left results rail — confine it
      // to the detail pane.
      const root = key === "linkedin.com" ? liDetailRoot() : null;
      data = {
        title: data.title || textOf("h1") || clean(document.title),
        company: data.company || "",
        location: data.location || "",
        description: bigVisibleText(root || undefined) || data.description || "",
      };
    }
    return {
      url: location.href.split("#")[0],
      title: clean(data.title),
      company: clean(data.company) || clean(location.hostname.replace(/^www\.|\.com$|\.io$|\.co$/g, "")),
      location: clean(data.location),
      description: clean(data.description).slice(0, 40000),
      site: key || location.hostname,
    };
  };
})();
