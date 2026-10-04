import { requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { defaultEngineId, isAdmin, listEngines } from "@/lib/engines/registry";
import { userEmail } from "@/lib/users";
import { fail, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Admin-only: registered engines, which are enabled, capabilities, list price and missing key NAMES (never values). */
export async function GET() {
  const env = await requireEnv();
  const userId = await sessionUserId();
  if (!userId) return fail(401, "sign_in", "Sign in first.");
  if (!isAdmin(env, await userEmail(env.DB, userId))) return fail(403, "forbidden", "Admins only.");
  const c = readConfig(env);
  return Response.json(
    {
      ok: true,
      default: defaultEngineId(env),
      override: "Send header x-sq-engine: <id> on POST /api/transcribe (ADMIN_EMAILS only).",
      langTagger: { mode: c.langTagger, model: c.langTaggerModel },
      engines: listEngines(env),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
