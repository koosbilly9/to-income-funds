import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { DEFAULT_TARGET, formatRand, requiredBalance, validFundPayload } = require("../public/app.js");

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
