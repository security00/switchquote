import { test } from "node:test";
import assert from "node:assert/strict";
import { admit, toMicro } from "./spend";

test("global breaker wins over the per-user breaker", () => {
  assert.deepEqual(admit(toMicro(2.9), 0, toMicro(0.31), toMicro(3), toMicro(1)), { ok: false, scope: "global" });
  assert.deepEqual(admit(0, toMicro(0.9), toMicro(0.31), toMicro(3), toMicro(1)), { ok: false, scope: "user" });
  assert.deepEqual(admit(0, 0, toMicro(0.31), toMicro(3), toMicro(1)), { ok: true });
});

test("zero limit blocks every paid call", () => {
  assert.equal(admit(0, 0, 1, 0, toMicro(1)).ok, false);
});
