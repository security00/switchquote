import { requireEnv } from "@/lib/cf";
import { loadTranscript } from "@/lib/store";
import { actorForRequest } from "@/lib/smoke";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

async function owner(req: Request) {
  const env = await requireEnv();
  const resolved = await actorForRequest(req, env, await sessionUserId(), {
    enforceAllowlist: false,
    mintSmoke: false,
    signedOutError: "Sign in with Google.",
  });
  if (!resolved.ok) return resolved;
  return { ok: true as const, env, userId: resolved.actor.userId };
}

export async function GET(req: Request, ctx: RouteContext<"/api/transcripts/[id]">) {
  const who = await owner(req);
  if (!who.ok) return fail(who.status, who.code, who.error);
  const { id } = await ctx.params;
  const t = await loadTranscript(who.env.DB, who.userId, id);
  if (!t) return fail(404, "not_found", "Transcript not found.");
  return json({ ok: true, transcript: t });
}

/** Delete now: removes the transcript (audio is never stored). Spend rows are kept for audit. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/transcripts/[id]">) {
  const who = await owner(req);
  if (!who.ok) return fail(who.status, who.code, who.error);
  const { id } = await ctx.params;
  const res = await who.env.DB.prepare(`DELETE FROM transcripts WHERE id = ? AND user_id = ?`).bind(id, who.userId).run();
  if (res.meta.changes !== 1) return fail(404, "not_found", "Transcript not found.");
  return json({ ok: true });
}
