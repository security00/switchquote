import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSrc, hrefWithSrc } from "./src";

test("src query is limited to a short slug and preserved on app links", () => {
  assert.equal(cleanSrc("Hero"), "hero");
  assert.equal(cleanSrc("../admin"), "");
  assert.equal(cleanSrc("nav-top"), "nav-top");
  assert.equal(hrefWithSrc("/app", "hero"), "/app?src=hero");
  assert.equal(hrefWithSrc("/pricing?checkout=cancel", "pricing-free"), "/pricing?checkout=cancel&src=pricing-free");
  assert.equal(hrefWithSrc("/app#sample", "spanglish"), "/app?src=spanglish#sample");
  assert.equal(hrefWithSrc("/app", "nope!"), "/app");
});
