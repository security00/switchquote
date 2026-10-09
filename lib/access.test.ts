import { test } from "node:test";
import assert from "node:assert/strict";
import { accessForEmail } from "./access";
import { parseAllowlist, readConfig } from "./config";

test("allowlist is case-insensitive and blocks everyone else", () => {
  const list = parseAllowlist(" Xiangqiling5204@gmail.com ");
  assert.equal(accessForEmail(list, "xiangqiling5204@GMAIL.com"), "allowed");
  assert.equal(accessForEmail(list, "someone@example.com"), "waitlist");
  assert.equal(accessForEmail(list, null), "waitlist");
  assert.equal(accessForEmail(parseAllowlist(""), "anyone@example.com"), "open");
  assert.equal(accessForEmail(parseAllowlist("*"), "anyone@example.com"), "open");
});

test("config defaults are conservative", () => {
  const c = readConfig({});
  assert.equal(c.signupFreeCredits, 0);
  assert.equal(c.maxFileBytes, 50 * 1024 * 1024);
  assert.equal(c.maxDurationSec, 3600);
  assert.equal(c.langTagger, "llm");
  assert.equal(c.isPreview, false);
});
