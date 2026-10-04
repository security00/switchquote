import type { AppEnv } from "./cf";

function randomHex(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const cache = new Map<string, string>();

/** A Worker secret when set, otherwise one generated value persisted in D1 (app_secrets). */
export async function getOrCreateSecret(env: AppEnv, name: string, bound?: string): Promise<string> {
  if (bound && bound.trim()) return bound.trim();
  const hit = cache.get(name);
  if (hit) return hit;
  await env.DB.prepare(`INSERT OR IGNORE INTO app_secrets (name, value) VALUES (?, ?)`).bind(name, randomHex()).run();
  const row = await env.DB.prepare(`SELECT value FROM app_secrets WHERE name = ?`).bind(name).first<{ value: string }>();
  if (!row?.value) throw new Error(`Could not load ${name}`);
  cache.set(name, row.value);
  return row.value;
}

export const getAuthSecret = (env: AppEnv) => getOrCreateSecret(env, "auth_secret", env.AUTH_SECRET);
export const getSigningSecret = (env: AppEnv) => getOrCreateSecret(env, "signing_secret");

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
