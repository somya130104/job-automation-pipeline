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
  const bigVisibleText = () => {
    // Fallback: the largest text block on the page is almost always the JD.
    let best = "";
    document.querySelectorAll("main, article, section, div").forEach((el) => {
      const t = clean(el.innerText);
      if (t.length > best.length && t.length < 20000) best = t;
    });
    return best;
  };

  const EXTRACTORS = {
    "linkedin.com": () => ({
      title: textOf(".job-details-jobs-unified-top-card__job-title, .topcard__title, h1"),
      company: textOf(
        ".job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, .jobs-unified-top-card__company-name"
      ),
      location: textOf(
        ".job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet, .jobs-unified-top-card__bullet"
      ),
      description: textOf(
        "#job-details, .jobs-description__content, .show-more-less-html__markup, .description__text"
      ),
    }),
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
      const cards = document.querySelectorAll(
        "li.scaffold-layout__list-item, div.job-card-container, li.jobs-search-results__list-item, div.job-card-job-posting-card-wrapper"
      );
      return Array.from(cards).map((card) => {
        let href = attr(card, [
          'a.job-card-container__link[href*="/jobs/view/"]',
          'a.job-card-list__title[href*="/jobs/view/"]',
          'a[href*="/jobs/view/"]',
        ]);
        const idEl = card.matches("[data-job-id]")
          ? card
          : card.querySelector("[data-job-id]");
        const jobId = idEl && idEl.getAttribute("data-job-id");
        if (!href && jobId) href = `https://www.linkedin.com/jobs/view/${jobId}/`;
        if (href && href.startsWith("/")) href = "https://www.linkedin.com" + href;
        return {
          url: (href || "").split("?")[0],
          title: inCard(card, [
            "a.job-card-list__title",
            "a.job-card-container__link",
            ".job-card-list__title--link",
            ".artdeco-entity-lockup__title",
            "h3",
          ]),
          company: inCard(card, [
            ".artdeco-entity-lockup__subtitle",
            ".job-card-container__primary-description",
            ".job-card-container__company-name",
            "h4",
          ]),
          location: inCard(card, [
            ".job-card-container__metadata-item",
            ".artdeco-entity-lockup__caption",
            ".job-card-container__metadata-wrapper li",
          ]),
          description: inCard(card, [
            ".job-card-list__footer-wrapper",
            ".job-card-container__metadata-wrapper",
          ]),
        };
      });
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
    if (!data.description || data.description.length < 120) {
      data = {
        title: data.title || textOf("h1") || clean(document.title),
        company: data.company || "",
        location: data.location || "",
        description: bigVisibleText(),
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
