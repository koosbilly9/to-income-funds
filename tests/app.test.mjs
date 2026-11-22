import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_TARGET, apiUrl, formatRand, requiredBalance, targetShares, validFundPayload } = require("../app.js");

test("calculates gross balance needed to meet the annual target", () => {
  assert.equal(DEFAULT_TARGET, 300000);
  assert.equal(requiredBalance(300000, 8), 3750000);
  assert.equal(requiredBalance(300000, 0), null);
  assert.equal(requiredBalance(-1, 8), null);
});

test("formats ZAR and rejects incomplete fund responses", () => {
  assert.match(formatRand(300000), /R/);
  assert.throws(() => validFundPayload({ funds: [] }), /invalid/i);
  assert.equal(validFundPayload({ funds: [{ id: "absa-45-day-notice" }] }).funds.length, 1);
});

test("rounds the STRC share count up after converting the ZAR goal to USD", () => {
  assert.equal(targetShares(300000, 9.2, 17.5), 1864);
  assert.equal(targetShares(300000, null, 17.5), null);
  assert.equal(targetShares(300000, 9.2, 0), null);
});

test("uses the dedicated Worker API on GitHub Pages and relative routes locally", () => {
  assert.equal(
    apiUrl("/api/strc?v=2", "koosbilly9.github.io"),
    "https://investment-funds.koosbilly9.workers.dev/api/strc?v=2",
  );
  assert.equal(
    apiUrl("/api/funds", "koosbilly9.github.io"),
    "https://investment-funds.koosbilly9.workers.dev/api/funds",
  );
  assert.equal(apiUrl("/api/strc", "localhost"), "/api/strc");
});
