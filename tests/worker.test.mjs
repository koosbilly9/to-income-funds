import test from "node:test";
import assert from "node:assert/strict";
import worker, { buildFundData } from "../cloudflare/worker.js";

test("returns only the requested Absa notice account and leaves unverified figures blank", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");
  const data = buildFundData({}, now);
  assert.equal(data.updatedAt, now.toISOString());
  assert.equal(data.funds.length, 1);
  assert.equal(data.funds[0].id, "absa-45-day-notice");
  assert.equal(data.funds[0].minimumInvestmentZar, null);
  assert.equal(data.funds[0].annualRatePercent, null);
  assert.equal(data.funds[0].category, "Notice deposit account");
});

test("accepts explicitly configured rate and minimum with a source date", () => {
  const data = buildFundData({
    ABSA_MINIMUM_ZAR: "1000",
    ABSA_ANNUAL_RATE_PERCENT: "7.5",
    ABSA_RATE_AS_OF: "2026-11-22",
  });
  assert.equal(data.funds[0].minimumInvestmentZar, 1000);
  assert.equal(data.funds[0].annualRatePercent, 7.5);
  assert.equal(data.funds[0].rateAsOf, "2026-11-22");
});

test("rejects malformed configuration instead of publishing invalid figures", () => {
  assert.throws(() => buildFundData({ ABSA_ANNUAL_RATE_PERCENT: "-2" }), /number from 0 to 100/);
  assert.throws(() => buildFundData({ ABSA_ANNUAL_RATE_PERCENT: "101" }), /number from 0 to 100/);
  assert.throws(() => buildFundData({ ABSA_RATE_AS_OF: "22-11-2026" }), /YYYY-MM-DD/);
});

test("GET /api/funds returns cacheable JSON and non-GET requests are rejected", async () => {
  const getResponse = await worker.fetch(new Request("https://funds.example/api/funds"), {});
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.headers.get("Cache-Control"), "public, max-age=60");
  assert.equal((await getResponse.json()).funds.length, 1);

  const postResponse = await worker.fetch(new Request("https://funds.example/api/funds", { method: "POST" }), {});
  assert.equal(postResponse.status, 405);
  assert.equal(postResponse.headers.get("Allow"), "GET");
});

test("returns a server error for invalid public fund configuration", async () => {
  const response = await worker.fetch(
    new Request("https://funds.example/api/funds"),
    { ABSA_ANNUAL_RATE_PERCENT: "bad" },
  );
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Fund data configuration is invalid" });
});

test("routes static files through the assets binding and returns API 404s", async () => {
  const assets = {
    fetch(request) {
      return new Response(new URL(request.url).pathname, { status: 200 });
    },
  };
  const page = await worker.fetch(new Request("https://funds.example/"), { ASSETS: assets });
  assert.equal(await page.text(), "/");

  const missing = await worker.fetch(new Request("https://funds.example/api/missing"), { ASSETS: assets });
  assert.equal(missing.status, 404);
});
