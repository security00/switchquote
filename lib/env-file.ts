import type { AppEnv } from "./cf";

/** String bindings a local `.env` may supply when Wrangler has not. */
const FILE_KEYS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER_MONTHLY",
  "STRIPE_PRICE_STARTER_YEARLY",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_YEARLY",
  "STRIPE_PRICE_STUDIO_MONTHLY",
  "STRIPE_PRICE_STUDIO_YEARLY",
  "STRIPE_PRICE_PACK_S",
  "STRIPE_PRICE_PACK_M",
  "STRIPE_PRICE_PACK_L",
] as const satisfies readonly (keyof AppEnv)[];

function trimmed(source: Record<string, string | undefined>, key: string): string {
  return (source[key] ?? "").trim();
}

function isLiveStripeKey(value: string): boolean {
  return value.startsWith("sk_live") || value.startsWith("rk_live");
}

/**
 * Fill empty Worker bindings from process env. Next dev loads `.env`, but the OpenNext
 * proxy does not. A live Stripe key is never accepted. `STRIPE_API_TOKEN_SANDBOX` is the
 * name used in the local file for the test secret.
 */
export function fillEnvFromFile(env: AppEnv, source: Record<string, string | undefined>): AppEnv {
  const next: AppEnv = { ...env };
  // `next dev` loads `.env` into process.env. Prefer that file in development so a local
  // client id is not hidden by an older Wrangler binding. Production keeps the Worker binding.
  const preferFile = trimmed(source, "NODE_ENV") === "development";
  for (const key of FILE_KEYS) {
    const current = typeof next[key] === "string" ? next[key].trim() : "";
    const fromFile = trimmed(source, key);
    if (fromFile && (preferFile || !current)) next[key] = fromFile;
  }
  if (preferFile || !String(next.STRIPE_SECRET_KEY ?? "").trim()) {
    const sandbox = trimmed(source, "STRIPE_API_TOKEN_SANDBOX");
    if (sandbox.startsWith("sk_test") || sandbox.startsWith("rk_test")) next.STRIPE_SECRET_KEY = sandbox;
  }
  if (isLiveStripeKey(String(next.STRIPE_SECRET_KEY ?? ""))) next.STRIPE_SECRET_KEY = "";
  return next;
}
