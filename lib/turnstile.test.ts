import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile } from "./turnstile";

const fake = (body: object) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

test("missing token is rejected when a secret is configured", async () => {
  const r = await verifyTurnstile({ token: "", secretKey: "s", fetchFn: fake({ success: true }) });
  assert.equal(r.ok, false);
  assert.equal(r.status, "missing");
});

test("hostname and action must match", async () => {
  const ok = await verifyTurnstile({ token: "t", secretKey: "s", expectedHostname: "a.dev", expectedAction: "transcribe", fetchFn: fake({ success: true, hostname: "a.dev", action: "transcribe" }) });
  assert.equal(ok.ok, true);
  const badHost = await verifyTurnstile({ token: "t", secretKey: "s", expectedHostname: "a.dev", fetchFn: fake({ success: true, hostname: "b.dev" }) });
  assert.equal(badHost.ok, false);
  const badAction = await verifyTurnstile({ token: "t", secretKey: "s", expectedAction: "transcribe", fetchFn: fake({ success: true, action: "generate" }) });
  assert.equal(badAction.ok, false);
});
