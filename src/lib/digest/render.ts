import type { DigestJob, DigestSelection } from "./select";

/**
 * Hand-rolled HTML email. No React Email dependency — email clients need
 * table layout and inline styles regardless, and a template string keeps the
 * build lean. Palette matches the app: near-black #0c0a09 ground, amber
 * #f5a623 accent, off-white text.
 */

const ACCENT = "#f5a623";
const INK = "#0c0a09";
const RAISED = "#17140f";
const HAIRLINE = "#2a251d";
const PAPER = "#f4efe6";
const MUTED = "#9a9084";

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function chip(text: string, tone: "matched" | "missing"): string {
  const bg = tone === "matched" ? "rgba(245,166,35,0.14)" : "rgba(154,144,132,0.14)";
  const fg = tone === "matched" ? ACCENT : MUTED;
  return `<span style="display:inline-block;font:600 11px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${fg};background:${bg};padding:2px 8px;border-radius:999px;margin:0 4px 4px 0;">${esc(text)}</span>`;
}

function jobCard(job: DigestJob): string {
  const loc = job.remoteType === "remote" ? "Remote" : job.location ?? "Location n/a";
  const matched = job.matched.map((k) => chip(k, "matched")).join("");
  const missing = job.missing.map((k) => chip(k, "missing")).join("");

  return `
  <tr><td style="padding:0 0 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${RAISED};border:1px solid ${HAIRLINE};border-radius:14px;">
      <tr><td style="padding:16px 18px;">
        <table role="presentation" width="100%"><tr>
          <td style="font:700 16px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${PAPER};">
            ${esc(job.title)}
          </td>
          <td align="right" style="font:800 15px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:${ACCENT};white-space:nowrap;padding-left:10px;">
            ${job.score}<span style="font-size:11px;color:${MUTED};">/100</span>
          </td>
        </tr></table>
        <div style="font:500 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};margin:2px 0 10px;">
          ${esc(job.company)} &nbsp;·&nbsp; ${esc(loc)}
        </div>
        ${matched ? `<div style="margin-bottom:2px;">${matched}</div>` : ""}
        ${missing ? `<div style="margin-bottom:8px;"><span style="font:600 10px/1.6 -apple-system,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:0.06em;">Gaps:&nbsp;</span>${missing}</div>` : ""}
        <a href="${esc(job.deepLink)}" style="display:inline-block;font:700 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:${INK};background:${ACCENT};padding:9px 14px;border-radius:8px;text-decoration:none;">
          View &amp; score breakdown &rarr;
        </a>
      </td></tr>
    </table>
  </td></tr>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDigest(
  selection: DigestSelection,
  origin: string,
): RenderedEmail {
  const n = selection.jobs.length;
  const subject = `${n} new job match${n === 1 ? "" : "es"} today`;
  const unsub = selection.unsubToken
    ? `${origin}/api/digest/unsubscribe?token=${selection.unsubToken}`
    : `${origin}/settings`;

  const html = `<!doctype html><html><body style="margin:0;background:${INK};padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:92vw;">
      <tr><td style="padding:0 4px 18px;">
        <div style="font:800 13px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:${ACCENT};letter-spacing:0.12em;text-transform:uppercase;">Kaam Se Kaam</div>
        <div style="font:800 30px/1.15 -apple-system,Segoe UI,Roboto,sans-serif;color:${PAPER};margin-top:8px;">
          ${n} new match${n === 1 ? "" : "es"}
        </div>
        <div style="font:500 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};margin-top:4px;">
          Posted in the last 24h, above your ${"match"} threshold, scored against your resume.
        </div>
      </td></tr>
      ${selection.jobs.map(jobCard).join("")}
      <tr><td style="padding:14px 4px 0;font:500 12px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:${MUTED};">
        <a href="${esc(origin)}/dashboard" style="color:${ACCENT};text-decoration:none;">Open the full feed</a>
        &nbsp;·&nbsp;
        <a href="${esc(origin)}/settings" style="color:${MUTED};text-decoration:none;">Digest settings</a>
        &nbsp;·&nbsp;
        <a href="${esc(unsub)}" style="color:${MUTED};text-decoration:none;">Unsubscribe</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = [
    `${n} new job match${n === 1 ? "" : "es"} today`,
    "",
    ...selection.jobs.map(
      (j) =>
        `• ${j.title} — ${j.company} (${j.score}/100)\n  ${j.deepLink}`,
    ),
    "",
    `Full feed: ${origin}/dashboard`,
    `Unsubscribe: ${unsub}`,
  ].join("\n");

  return { subject, html, text };
}
