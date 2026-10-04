import { encode } from "next-auth/jwt";
import { getEnv, nowSeconds, generateId } from "@/lib/cf";
import { getAuthSecret } from "@/lib/secrets";

export const dynamic = "force-dynamic";

// PREVIEW-ONLY QA helper (never merged to main). Mints a short-lived session for one synthetic
// qa-sq-*@example.com user (or the allowlisted owner address, as a synthetic session), only on the preview channel and only when a one-time code row
// `qa_code:<email>` exists in app_secrets. The row is consumed on use.
const COOKIE = "__Secure-authjs.session-token";

export async function POST(req: Request) {
  const env = await getEnv();
  if (!env || (env.DEPLOY_CHANNEL || "") !== "preview") return new Response("Not found", { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { code?: unknown; email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const allowedEmail = /^qa-sq-[a-z0-9-]+@example\.com$/.test(email) || email === "xiangqiling5204@gmail.com";
  if (!allowedEmail || typeof body.code !== "string" || body.code.length < 32) {
    return new Response("Not found", { status: 404 });
  }
  const consumed = await env.DB.prepare(`DELETE FROM app_secrets WHERE name = ? AND value = ?`).bind(`qa_code:${email}`, body.code).run();
  if (consumed.meta.changes !== 1) return new Response("Not found", { status: 404 });
  const ts = nowSeconds();
  const user = await env.DB
    .prepare(
      `INSERT INTO users (id, email, name, image, google_id, created_at, updated_at) VALUES (?, ?, 'QA', NULL, NULL, ?, ?)
       ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at RETURNING id`
    )
    .bind(generateId(), email, ts, ts)
    .first<{ id: string }>();
  if (!user) return new Response("Not found", { status: 404 });
  const value = await encode({
    token: { sub: user.id, userId: user.id, email, name: "QA" },
    secret: await getAuthSecret(env),
    salt: COOKIE,
    maxAge: 2 * 60 * 60,
  });
  return Response.json({ cookieName: COOKIE, value, userId: user.id }, { headers: { "Cache-Control": "no-store" } });
}
