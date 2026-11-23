import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// public/_headers is copied verbatim into .open-next/assets and applied by
// Workers static assets. Next.js headers() does not run for those responses.
test("static assets send the same X-Robots-Tag as HTML", () => {
  const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  const rules = [...headers.matchAll(/^(\S+)\n((?:[ \t]+.+\n?)*)/gm)].map((match) => ({
    path: match[1],
    lines: match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  }));

  const allAssets = rules.find((rule) => rule.path === "/*");
  assert.ok(allAssets, "missing catch-all static asset header rule");
  assert.deepEqual(allAssets.lines, ["X-Robots-Tag: noindex, nofollow"]);

  const hashed = rules.find((rule) => rule.path === "/_next/static/*");
  assert.ok(hashed, "missing hashed static cache rule");
  assert.deepEqual(hashed.lines, ["Cache-Control: public,max-age=31536000,immutable"]);
});
