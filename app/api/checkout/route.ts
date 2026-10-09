import { requireEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { NOT_ALLOWED_MESSAGE, accessForUser } from "@/lib/access";
import { createCheckoutSession } from "@/lib/stripe";
import { stripeCustomerId } from "@/lib/credits";
import { isSku } from "@/lib/pricing";
import { userEmail } from "@/lib/users";
import { fail, json, sessionUserId } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Checkout Session for an allowlisted signed-in user. Credits are granted by the webhook, not this response. */
export async function POST(req: Request) {
  const env = await requireEnv();
  const c = readConfig(env);
  if (!c.stripeSecretKey) return fail(503, "unavailable", "Checkout isn't switched on yet.");

  const userId = await sessionUserId();
  if (!userId) return fail(401, "sign_in", "Sign in with Google to buy credits.");
  if ((await accessForUser(env, userId)) === "waitlist") return fail(403, "not_allowed", NOT_ALLOWED_MESSAGE);

  let sku = "";
  try {
    const body = (await req.json()) as { sku?: unknown };
    sku = typeof body.sku === "string" ? body.sku : "";
  } catch {
    return fail(400, "bad_request", "Choose a plan or a credit pack.");
  }
  if (!isSku(sku)) return fail(400, "bad_sku", "That plan isn't available.");

  const email = await userEmail(env.DB, userId);
  if (!email) return fail(400, "bad_request", "This account has no email.");

  try {
    const url = await createCheckoutSession(env, {
      userId,
      email,
      sku,
      origin: new URL(req.url).origin,
      customerId: await stripeCustomerId(env.DB, userId),
    });
    return json({ ok: true, url });
  } catch (e) {
    console.error("[checkout]", e instanceof Error ? e.message : e);
    return fail(502, "stripe_failed", "Could not start checkout. Please try again.");
  }
}
