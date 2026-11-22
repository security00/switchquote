import { test } from "node:test";
import assert from "node:assert/strict";
import { cheapestPack, hourlyFromCredits, quotePacks, sonixCoreMonths, sonixPaygUsd } from "./rate-card";

test("pack hourly price uses one credit per minute", () => {
  assert.equal(hourlyFromCredits(9, 60), 9);
  assert.equal(hourlyFromCredits(24, 200), 7.2);
  assert.equal(hourlyFromCredits(59, 600), 5.9);
});

test("quotes cover the requested hours and pick the cheaper pack total", () => {
  const quotes = quotePacks(5);
  const small = quotes.find((quote) => quote.name === "S");
  const large = quotes.find((quote) => quote.name === "L");
  assert.equal(small?.packsNeeded, 5);
  assert.equal(small?.totalUsd, 45);
  assert.equal(large?.packsNeeded, 1);
  assert.equal(large?.totalUsd, 59);
  assert.equal(cheapestPack(5)?.name, "S");
  assert.equal(cheapestPack(10)?.name, "L");
});

test("public reference prices stay on the cited Sonix list", () => {
  assert.equal(sonixPaygUsd(3), 30);
  assert.deepEqual(sonixCoreMonths(5), { months: 1, usd: 25, hoursIncluded: 5 });
  assert.deepEqual(sonixCoreMonths(6), { months: 2, usd: 50, hoursIncluded: 10 });
  assert.equal(sonixPaygUsd(0), 0);
});
