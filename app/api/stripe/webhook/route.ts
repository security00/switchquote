import { getEnv } from "@/lib/cf";
import { readConfig } from "@/lib/config";
import { handleStripeEvent, stripeClient } from "@/lib/stripe";
import { fail, json } from "@/lib/http";

export const dynamic = "force-dynamic";

/** Stripe fulfillment. Signature is required; the success page does not grant credits. */
export async function POST(req: Request) {
  const env = await getEnv();
  if (!env) return fail(503, "unavailable", "Service unavailable.");
  const c = readConfig(env);
  if (!c.stripeSecretKey || !c.stripeWebhookSecret) return fail(503, "unavailable", "Stripe webhook is not configured.");

  const payload = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail(400, "bad_signature", "Missing Stripe signature.");

  const stripe = stripeClient(c.stripeSecretKey);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, c.stripeWebhookSecret);
  } catch (e) {
    console.error("[stripe] signature", e instanceof Error ? e.message : e);
    return fail(400, "bad_signature", "Invalid Stripe signature.");
  }

  try {
    await handleStripeEvent(env, event, stripe);
  } catch (e) {
    console.error("[stripe] fulfill", event.id, event.type, e instanceof Error ? e.message : e);
    return fail(500, "fulfill_failed", "Could not record the payment.");
  }
  return json({ received: true });
}
