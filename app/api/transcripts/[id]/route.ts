import { requireEnv } from "@/lib/cf";
import { loadTranscript } from "@/lib/store";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/transcripts/[id]">) {
  const env = await requireEnv();
  const userId = await sessionUserId();
  if (!userId) return fail(401, "sign_in", "Sign in with Google.");
  const { id } = await ctx.params;
  const t = await loadTranscript(env.DB, userId, id);
  if (!t) return fail(404, "not_found", "Transcript not found.");
  return json({ ok: true, transcript: t });
}

/** Delete now: removes the transcript (audio is never stored). Spend rows are kept for audit. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/transcripts/[id]">) {
  const env = await requireEnv();
  const userId = await sessionUserId();
  if (!userId) return fail(401, "sign_in", "Sign in with Google.");
  const { id } = await ctx.params;
  const res = await env.DB.prepare(`DELETE FROM transcripts WHERE id = ? AND user_id = ?`).bind(id, userId).run();
  if (res.meta.changes !== 1) return fail(404, "not_found", "Transcript not found.");
  return json({ ok: true });
}
