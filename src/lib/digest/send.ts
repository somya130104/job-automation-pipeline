import type { RenderedEmail } from "./render";

/**
 * Resend REST client — one POST, no SDK.
 *
 * With the sandbox sender (onboarding@resend.dev) Resend only *delivers* to
 * the address that owns the API key; add and verify a domain to send to
 * anyone. The call still succeeds either way, so digests don't error out in
 * dev — they just may not land in a stranger's inbox yet.
 */

export function resendEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(
  to: string,
  email: RenderedEmail,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY not set" };

  const from = process.env.DIGEST_FROM?.trim() || "onboarding@resend.dev";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: `Kaam Se Kaam <${from}>`,
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      return { ok: false, error: data.message || data.name || `Resend ${res.status}` };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
