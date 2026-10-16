import { requireEnv } from "@/lib/cf";
import { loadTranscript, writeTranscriptEdit } from "@/lib/store";
import { actorForRequest } from "@/lib/smoke";
import { applyTranscriptEdit } from "@/lib/transcript";
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

/** Rename a speaker, correct a word, or delete a word. Audio is never stored; this only edits the transcript. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/transcripts/[id]">) {
  const who = await owner(req);
  if (!who.ok) return fail(who.status, who.code, who.error);
  const { id } = await ctx.params;
  const current = await loadTranscript(who.env.DB, who.userId, id);
  if (!current || current.status !== "done") return fail(404, "not_found", "Transcript not found.");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "bad_edit", "That edit isn't valid.");
  }
  const edited = applyTranscriptEdit(current, body);
  if (!edited.ok) return fail(400, "bad_edit", edited.error);
  const wrote = await writeTranscriptEdit(who.env.DB, who.userId, id, edited.transcript);
  if (!wrote) return fail(404, "not_found", "Transcript not found.");
  return json({ ok: true, transcript: await loadTranscript(who.env.DB, who.userId, id) });
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
