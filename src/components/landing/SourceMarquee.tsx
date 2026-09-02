const COMPANIES = [
  "Stripe", "Figma", "Databricks", "OpenAI", "Notion", "GitLab",
  "Discord", "Cloudflare", "Ramp", "Linear", "Palantir", "Spotify",
  "Airtable", "RemoteOK",
];

/**
 * Infinite marquee. The list is rendered twice and the track translates -50%,
 * so the second copy lands exactly where the first began — that's what makes
 * the loop seamless rather than snapping.
 */
export function SourceMarquee() {
  return (
    <div className="mask-fade-x overflow-hidden border-b border-hairline bg-ink py-5">
      <div
        className="flex w-max animate-ticker gap-10"
        style={{ ["--ticker-duration" as string]: "38s" }}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className="flex shrink-0 items-center gap-10"
            aria-hidden={copy === 1}
          >
            {COMPANIES.map((name) => (
              <span
                key={name}
                className="display whitespace-nowrap text-2xl text-paper/25 transition-colors hover:text-accent"
              >
                {name}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
