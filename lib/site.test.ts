import { test } from "node:test";
import assert from "node:assert/strict";
import { site } from "./site";

test("site stays noindex during the debug phase", () => {
  assert.equal(site.indexable, false);
  assert.match(site.url, /^https:\/\/switchquote\.potter-faa\.workers\.dev$/);
});
