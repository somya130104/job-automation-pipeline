const STEPS = [
  {
    n: "01",
    title: "Drop in your resume",
    body: "PDF or DOCX. It gets parsed into skills, dated roles and education — and gets an ATS-readability score, because if our parser can't read your dates, neither can a recruiter's screen.",
  },
  {
    n: "02",
    title: "Every board gets polled",
    body: "Greenhouse, Lever, Ashby and RemoteOK are normalised behind one interface, deduped across sources, and stamped with a stable fingerprint so a re-run never double-counts a posting.",
  },
  {
    n: "03",
    title: "Scored against you",
    body: "Keyword coverage, title relevance, experience fit and location, blended with tunable weights. Every score shows its breakdown, so you can see why something ranked where it did.",
  },
  {
    n: "04",
    title: "Tracked to the offer",
    body: "Saved → Applied → Interviewing → Offer. Marking a job applied snapshots the JD, because postings get edited and pulled while you're still waiting to hear back.",
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-7xl px-4 py-20 sm:py-28">
      <p className="label-mono mb-3 !text-accent">How it works</p>
      <h2 className="display max-w-[16ch] text-[clamp(2rem,5.5vw,4rem)]">
        Four steps, no spreadsheet.
      </h2>

      <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2">
        {STEPS.map((step) => (
          <div
            key={step.n}
            className="group relative bg-chrome p-7 transition-colors hover:bg-raised"
          >
            <span className="display absolute right-5 top-4 text-5xl text-paper/[0.07] transition-colors group-hover:text-accent/20">
              {step.n}
            </span>
            <h3 className="display relative mb-3 text-xl">{step.title}</h3>
            <p className="relative max-w-[46ch] text-sm leading-relaxed text-paper/65">
              {step.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
