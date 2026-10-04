import type { AppEnv } from "./cf";
import { generateId, nowSeconds } from "./cf";
import { readConfig } from "./config";

/** Operator alert email via the Cloudflare Email Sending binding (pattern from crayonink). Every attempt is logged. */
export async function sendAlert(env: AppEnv, kind: string, subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const { alertTo, alertFrom } = readConfig(env);
  let status = "failed";
  let messageId: string | null = null;
  let error: string | null = null;
  if (!env.EMAIL || !alertTo || !alertFrom) {
    error = "EMAIL binding or ALERT_EMAIL_TO/FROM not configured";
  } else {
    try {
      const res = await env.EMAIL.send({ from: { email: alertFrom, name: "SwitchQuote alerts" }, to: alertTo, subject, text });
      status = "sent";
      messageId = (res as { messageId?: string } | undefined)?.messageId ?? null;
    } catch (e) {
      error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    }
  }
  try {
    await env.DB
      .prepare(`INSERT INTO alert_log (id, kind, recipient, subject, body, status, message_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(generateId(), kind, alertTo || "-", subject, text.slice(0, 4000), status, messageId, error, nowSeconds())
      .run();
  } catch (e) {
    console.error("[alerts] log failed", e instanceof Error ? e.message : e);
  }
  return status === "sent" ? { ok: true } : { ok: false, error: error ?? "unknown" };
}
