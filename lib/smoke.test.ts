import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AppEnv } from "./cf";
import { hmacHex } from "./secrets";
import { SMOKE_IP_DAILY_CAP, actorForRequest, reserveSmokeRequest, verifySmokeValue } from "./smoke";
import { chooseEngine } from "./engines/registry";

type Sqlite = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
};

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => Sqlite };

function openDb(): D1Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(path.join(process.cwd(), "migrations/0002_transcription_mvp.sql"), "utf8"));
  const prepare = (sql: string) => {
    const bound = (params: unknown[]) => ({
      async run() {
        const info = sqlite.prepare(sql).run(...params);
        return { success: true, meta: { changes: Number(info.changes) } };
      },
      async first<T>() {
        return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
      },
      async all<T>() {
        return { results: sqlite.prepare(sql).all(...params) as T[] };
      },
    });
    return { ...bound([]), bind: (...params: unknown[]) => bound(params) };
  };
  return { prepare } as unknown as D1Database;
}

const signedOut = { enforceAllowlist: true, mintSmoke: true, signedOutError: "Sign in with Google to transcribe." } as const;
const DAY = Math.floor(Date.UTC(2026, 9, 14, 12) / 1000);
const NEXT_DAY = Math.floor(Date.UTC(2026, 9, 15, 1) / 1000);

function env(extra: Partial<AppEnv> = {}): AppEnv {
  return { DB: openDb(), TRANSCRIBE_ALLOWLIST: "xiangqiling5204@gmail.com", ...extra } as AppEnv;
}

function request(ip: string | null, cookie?: string): Request {
  const headers = new Headers();
  if (ip) headers.set("cf-connecting-ip", ip);
  if (cookie) headers.set("cookie", cookie);
  return new Request("https://switchquote.potter-faa.workers.dev/api/transcribe", { headers });
}

function cookiePair(setCookie: string | null): string {
  const pair = (setCookie || "").split(";")[0];
  const eq = pair.indexOf("=");
  return `${pair.slice(0, eq)}=${decodeURIComponent(pair.slice(eq + 1))}`;
}

test("smoke session cookie is bound, expiring, and not forgeable", async () => {
  const secret = "test-secret";
  const exp = DAY + 3600;
  const sig = (await hmacHex(secret, `smoke:abcabcabcabcabcabcabcabc:${exp}`)).slice(0, 32);
  const value = `abcabcabcabcabcabcabcabc.${exp}.${sig}`;
  assert.deepEqual(await verifySmokeValue(value, secret, DAY), { id: "abcabcabcabcabcabcabcabc", exp });
  assert.equal(await verifySmokeValue(value, secret, exp + 1), null);
  assert.equal(await verifySmokeValue(value.slice(0, -1) + (value.endsWith("a") ? "b" : "a"), secret, DAY), null);
  assert.equal(await verifySmokeValue(`abcabcabcabcabcabcabcabc.${DAY + 24 * 3600 + 5}.${sig}`, secret, DAY), null);
});

test("flag off blocks anonymous transcribe and ignores a smoke cookie", async () => {
  const off = env({ SMOKE_ANON: "0", TURNSTILE_SECRET_KEY: "secret", TURNSTILE_SITE_KEY: "site" });
  const blocked = await actorForRequest(request("203.0.113.8", "sq_smoke=nope"), off, null, signedOut, DAY);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.equal(blocked.code, "sign_in");
});

test("smoke flag does not let a signed-in account skip the allowlist", async () => {
  const on = env({ SMOKE_ANON: "1", TURNSTILE_SECRET_KEY: "secret", TURNSTILE_SITE_KEY: "site" });
  await on.DB.prepare(`INSERT INTO users (id, email, name, image, google_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, 1, 1)`)
    .bind("user_ok", "xiangqiling5204@gmail.com", "g_ok")
    .run();
  const allowed = await actorForRequest(request("203.0.113.8"), on, "user_ok", signedOut, DAY);
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.actor.smoke, false);
    assert.equal(allowed.actor.userId, "user_ok");
    assert.equal(allowed.actor.spendUserId, "user_ok");
  }
  const waitlisted = await actorForRequest(request("203.0.113.8"), on, "user_other", signedOut, DAY);
  assert.equal(waitlisted.ok, false);
  if (!waitlisted.ok) assert.equal(waitlisted.code, "not_allowed");
});

test("anonymous smoke requires Turnstile and a client IP, then resumes the same browser", async () => {
  const bare = env({ SMOKE_ANON: "1" });
  const noTurnstile = await actorForRequest(request("203.0.113.8"), bare, null, signedOut, DAY);
  assert.equal(noTurnstile.ok, false);
  if (!noTurnstile.ok) assert.equal(noTurnstile.code, "human_check");

  const on = env({ SMOKE_ANON: "1", TURNSTILE_SECRET_KEY: "secret", TURNSTILE_SITE_KEY: "site" });
  const noIp = await actorForRequest(request(null), on, null, signedOut, DAY);
  assert.equal(noIp.ok, false);
  if (!noIp.ok) assert.equal(noIp.code, "smoke_ip");

  const minted = await actorForRequest(request("203.0.113.8"), on, null, signedOut, DAY);
  assert.equal(minted.ok, true);
  if (!minted.ok) return;
  assert.equal(minted.actor.smoke, true);
  assert.equal(minted.actor.email, null);
  assert.match(minted.actor.userId, /^smoke:[0-9a-f]{24}$/);
  assert.match(minted.actor.spendUserId, /^smoke-ip:[0-9a-f]{24}$/);
  assert.equal(minted.actor.expiresAt, DAY + 24 * 3600);
  assert.match(minted.actor.setCookie || "", /^sq_smoke=/);
  assert.match(minted.actor.setCookie || "", /HttpOnly/);
  assert.match(minted.actor.setCookie || "", /Secure/);

  const resumed = await actorForRequest(request("203.0.113.8", cookiePair(minted.actor.setCookie)), on, null, { ...signedOut, mintSmoke: false }, DAY + 10);
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.actor.userId, minted.actor.userId);
  assert.equal(resumed.actor.setCookie, null);
  assert.equal(resumed.actor.spendUserId, minted.actor.spendUserId);

  const otherIp = await actorForRequest(request("203.0.113.9", cookiePair(minted.actor.setCookie)), on, null, { ...signedOut, mintSmoke: false }, DAY + 10);
  assert.equal(otherIp.ok, true);
  if (otherIp.ok) {
    assert.equal(otherIp.actor.userId, minted.actor.userId);
    assert.notEqual(otherIp.actor.spendUserId, minted.actor.spendUserId);
  }

  const lost = await actorForRequest(request("203.0.113.8"), on, null, { ...signedOut, mintSmoke: false }, DAY);
  assert.equal(lost.ok, false);
  if (!lost.ok) assert.equal(lost.code, "smoke_session");

  assert.equal(chooseEngine(on, null, "grok").ok, false);
});

test("IP/day cap is a hard request limit and does not book USD", async () => {
  const db = openDb();
  const on = { DB: db, SPEND_NAMESPACE: "" } as AppEnv;
  const ip = "smoke-ip:aaaaaaaaaaaaaaaaaaaaaaaa";
  for (let i = 0; i < SMOKE_IP_DAILY_CAP; i++) assert.equal(await reserveSmokeRequest(on, ip, DAY), true);
  assert.equal(await reserveSmokeRequest(on, ip, DAY), false);
  const row = await db.prepare(`SELECT calls, micro_usd FROM spend_ledger WHERE ledger_key = ? AND day = ?`).bind(`smoke-req:${ip}`, "2026-10-14").first<{ calls: number; micro_usd: number }>();
  assert.equal(row?.calls, SMOKE_IP_DAILY_CAP);
  assert.equal(row?.micro_usd, 0);
  assert.equal(await reserveSmokeRequest(on, ip, NEXT_DAY), true);
  assert.equal(await reserveSmokeRequest(on, "smoke-ip:bbbbbbbbbbbbbbbbbbbbbbbb", DAY), true);
});
