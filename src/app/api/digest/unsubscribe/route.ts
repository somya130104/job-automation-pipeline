import { db } from "@/lib/db";
import { route } from "@/lib/api";

export const runtime = "nodejs";

/**
 * GET /api/digest/unsubscribe?token=...
 *
 * One-click unsubscribe from the email footer. Sets digestFrequency='off' for
 * the user whose unsubToken matches, then shows a tiny confirmation page (this
 * is opened from an email client, so it renders HTML, not JSON).
 */
export const GET = route(async (req: Request) => {
  const token = new URL(req.url).searchParams.get("token")?.trim();

  let message = "That unsubscribe link is invalid or expired.";
  if (token) {
    const user = await db.user.findFirst({ where: { unsubToken: token } });
    if (user) {
      await db.user.update({
        where: { id: user.id },
        data: { digestFrequency: "off" },
      });
      message =
        "Done — you won't get the daily digest any more. You can turn it back on in Settings any time.";
    }
  }

  return new Response(
    `<!doctype html><html><body style="margin:0;background:#0c0a09;color:#f4efe6;font:500 15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;">
      <div style="max-width:420px;padding:32px;text-align:center;">
        <div style="font:800 13px/1 sans-serif;color:#f5a623;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:14px;">Kaam Se Kaam</div>
        <p>${message}</p>
        <a href="/settings" style="display:inline-block;margin-top:16px;color:#0c0a09;background:#f5a623;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700;">Digest settings</a>
      </div>
    </body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
});
