import { test } from "node:test";
import assert from "node:assert/strict";
import type { AppEnv } from "./cf";
import { fillEnvFromFile } from "./env-file";

const base = { DB: {} as D1Database } as AppEnv;

test("fills empty auth and stripe bindings from the env file", () => {
  const env = fillEnvFromFile(base, {
    AUTH_GOOGLE_ID: " client ",
    AUTH_GOOGLE_SECRET: " secret ",
    STRIPE_API_TOKEN_SANDBOX: "sk_test_abc",
    STRIPE_WEBHOOK_SECRET: "whsec_test",
  });
  assert.equal(env.AUTH_GOOGLE_ID, "client");
  assert.equal(env.AUTH_GOOGLE_SECRET, "secret");
  assert.equal(env.STRIPE_SECRET_KEY, "sk_test_abc");
  assert.equal(env.STRIPE_WEBHOOK_SECRET, "whsec_test");
});

test("development uses the env file; production keeps the worker binding", () => {
  const dev = fillEnvFromFile({ ...base, AUTH_GOOGLE_ID: "from-worker" }, { NODE_ENV: "development", AUTH_GOOGLE_ID: "from-file" });
  assert.equal(dev.AUTH_GOOGLE_ID, "from-file");
  const prod = fillEnvFromFile({ ...base, AUTH_GOOGLE_ID: "from-worker" }, { NODE_ENV: "production", AUTH_GOOGLE_ID: "from-file" });
  assert.equal(prod.AUTH_GOOGLE_ID, "from-worker");
  const live = fillEnvFromFile(base, { NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_live_no", STRIPE_API_TOKEN_SANDBOX: "sk_test_yes" });
  assert.equal(live.STRIPE_SECRET_KEY, "sk_test_yes");
  const sandboxOnly = fillEnvFromFile(base, { STRIPE_API_TOKEN_LIVE: "sk_live_no", STRIPE_API_TOKEN_SANDBOX: "rk_test_yes" });
  assert.equal(sandboxOnly.STRIPE_SECRET_KEY, "rk_test_yes");
});
