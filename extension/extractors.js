/**
 * Per-site DOM extractors. Each returns { title, company, description, location }
 * from the job page the user is ALREADY viewing. User-initiated capture of
 * visible content — the same model Teal / Huntr / Simplify use — not scraping:
 * nothing here navigates, paginates, scrolls, or runs without a click.
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

  // LinkedIn's split view puts the job detail in a right-hand pane; scope the
  // fallback text scan to it so it doesn't grab the left results rail.
  const liDetailRoot = () =>
    document.querySelector(
      ".jobs-search__job-details--container, .jobs-details__main-content, .job-view-layout, .jobs-details"
    );

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

  window.__ksk_extract = function () {
    const key = hostKey();
    let data = key ? EXTRACTORS[key]() : {};
    if (!data.description || data.description.length < 90) {
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
