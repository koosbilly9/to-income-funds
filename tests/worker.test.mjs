import test from "node:test";
import assert from "node:assert/strict";
import worker, { buildFundData, buildStrcData, parseAbsaNoticeSelectHtml } from "../cloudflare/worker.js";

const SAMPLE_ABSA_NOTICE_SELECT_HTML = `
<li class="accordion-slide odd">
  <div class="component-content" id="986041538" title="notice-select">
    <h2 class="box-heading">notice-select</h2>
  </div>
  <div class="richText-content">
    <p style="text-align: right;">Last reviewed on 25 Septmber 2026</p>
  </div>
  <div class="table">
    <table>
      <tbody>
        <tr><td colspan="5"><h4><strong>Standard&nbsp; Rate</strong></h4></td></tr>
        <tr><td colspan="5"><h5><strong>Balance R0.01 – R999</strong></h5></td></tr>
        <tr><td>&nbsp;</td><td>7 Days</td><td>15 Days</td><td>32 Days</td><td>45 Days</td></tr>
        <tr><td>50/50</td><td>0.10%</td><td>0.10%</td><td>0.10%</td><td>0.10%</td></tr>
        <tr><td>90/10</td><td>0.10%</td><td>0.10%</td><td>0.10%</td><td>0.10%</td></tr>
        <tr><td>100/0</td><td>0.10%</td><td>0.10%</td><td>0.10%</td><td>0.10%</td></tr>
      </tbody>
    </table>
  </div>
  <div class="table">
    <table>
      <tbody>
        <tr><td colspan="5"><h4><strong>Standard&nbsp; Rate</strong></h4></td></tr>
        <tr><td colspan="5"><h5><strong>Balance R1000 - R24 999</strong></h5></td></tr>
        <tr><td>&nbsp;</td><td>7 Days</td><td>15 Days</td><td>32 Days</td><td>45 Days</td></tr>
        <tr><td>50/50</td><td>5.55%</td><td>5.80%</td><td>5.85%</td><td>6.85%</td></tr>
        <tr><td>90/10</td><td>5.75%</td><td>6.00%</td><td>6.05%</td><td>7.25%</td></tr>
        <tr><td>100/0</td><td>5.85%</td><td>6.10%</td><td>6.15%</td><td>7.35%</td></tr>
      </tbody>
    </table>
  </div>
  <div class="table">
    <table>
      <tbody>
        <tr><td colspan="5"><h4><strong>Digital Bonus Rate</strong></h4></td></tr>
        <tr><td colspan="5"><h5><strong>Balance R1000 - R24 999</strong></h5></td></tr>
        <tr><td>&nbsp;</td><td>7 Days</td><td>15 Days</td><td>32 Days</td><td>45 Days</td></tr>
        <tr><td>100/0</td><td>6.10%</td><td>6.35%</td><td>6.40%</td><td>7.60%</td></tr>
      </tbody>
    </table>
  </div>
</li>
<li class="accordion-slide even">
  <div class="component-content" title="tax-free-savings"></div>
</li>
`;

test("parses the 45-day Notice Select standard rate, minimum deposit, and review date from Absa HTML", () => {
  const parsed = parseAbsaNoticeSelectHtml(SAMPLE_ABSA_NOTICE_SELECT_HTML, new Date("2026-11-22T12:00:00.000Z"));
  assert.ok(parsed);
  assert.equal(parsed.minimumInvestmentZar, 1000);
  assert.equal(parsed.annualRatePercent, 7.35);
  assert.equal(parsed.rateAsOf, "2026-09-25");
});

test("returns only the requested Absa notice account and leaves unverified figures blank", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");
  const data = buildFundData({}, now);
  assert.equal(data.updatedAt, now.toISOString());
  assert.equal(data.funds.length, 1);
  assert.equal(data.funds[0].id, "absa-45-day-notice");
  assert.equal(data.funds[0].minimumInvestmentZar, null);
  assert.equal(data.funds[0].annualRatePercent, null);
  assert.equal(data.funds[0].category, "Notice deposit account");
  assert.equal(data.funds[0].source.url, "https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select");
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

test("GET /api/funds downloads Absa Notice Select page, caches for one week, and rejects non-GET requests", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(String(url));
    return new Response(SAMPLE_ABSA_NOTICE_SELECT_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };
  try {
    const getResponse = await worker.fetch(new Request("https://funds.example/api/funds"), {});
    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.headers.get("Cache-Control"), "public, max-age=604800");
    assert.equal(getResponse.headers.get("Access-Control-Allow-Origin"), "*");
    const payload = await getResponse.json();
    assert.equal(payload.funds.length, 1);
    assert.equal(payload.funds[0].minimumInvestmentZar, 1000);
    assert.equal(payload.funds[0].annualRatePercent, 7.35);
    assert.equal(payload.funds[0].rateAsOf, "2026-09-25");
    assert.deepEqual(requestedUrls, ["https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select"]);

    const postResponse = await worker.fetch(new Request("https://funds.example/api/funds", { method: "POST" }), {});
    assert.equal(postResponse.status, 405);
    assert.equal(postResponse.headers.get("Allow"), "GET");

    const preflight = await worker.fetch(new Request("https://funds.example/api/funds", { method: "OPTIONS" }), {});
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal(preflight.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns a server error for invalid public fund configuration", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await worker.fetch(
      new Request("https://funds.example/api/funds"),
      { ABSA_ANNUAL_RATE_PERCENT: "bad" },
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Fund data configuration is invalid" });
  } finally {
    console.error = originalError;
  }
});

test("builds STRC trailing dividend yield using a live USD price and USD/ZAR rate", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const stockPayload = {
    chart: {
      result: [{
        meta: {
          symbol: "STRC",
          regularMarketPrice: 100,
          regularMarketTime: nowSeconds - 3600,
        },
        events: {
          dividends: {
            recent: { date: nowSeconds - 86400, amount: 0.5 },
            older: { date: nowSeconds - 200 * 86400000 / 1000, amount: 0.25 },
            expired: { date: nowSeconds - 366 * 86400000 / 1000, amount: 1.5 },
            future: { date: nowSeconds + 86400, amount: 2 },
          },
        },
      }],
    },
  };
  const fxPayload = {
    chart: {
      result: [{
        meta: {
          symbol: "USDZAR=X",
          regularMarketPrice: 17.5,
          regularMarketTime: nowSeconds,
        },
      }],
    },
  };

  const result = buildStrcData(stockPayload, fxPayload, now);
  assert.equal(result.symbol, "STRC");
  assert.equal(result.priceUsd, 100);
  assert.equal(result.usdZar, 17.5);
  assert.equal(result.trailingDividendPerShareUsd, 0.75);
  assert.equal(result.trailingDividendYieldPercent, 0.75);
  assert.equal(result.trailingDividendEvents, 2);
});

test("rejects malformed or mismatched STRC quote data", () => {
  assert.throws(() => buildStrcData(
    { chart: { result: [{ meta: { symbol: "OTHER" } }] } },
    { chart: { result: [{ meta: { symbol: "USDZAR=X" } }] } },
  ), /STRC chart response was invalid/);
});

test("GET /api/strc fetches current quotes and returns a five-minute cache header", async () => {
  const originalFetch = globalThis.fetch;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const responses = {
    STRC: {
      chart: {
        result: [{
          meta: { symbol: "STRC", regularMarketPrice: 100, regularMarketTime: nowSeconds },
          events: { dividends: { recent: { date: nowSeconds - 86400, amount: 0.5 } } },
        }],
      },
    },
    "USDZAR=X": {
      chart: {
        result: [{
          meta: { symbol: "USDZAR=X", regularMarketPrice: 17.5, regularMarketTime: nowSeconds },
        }],
      },
    },
  };
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    requestedUrls.push(url);
    const key = String(url).includes("USDZAR=X") ? "USDZAR=X" : "STRC";
    return Response.json(responses[key]);
  };
  try {
    const response = await worker.fetch(new Request("https://funds.example/api/strc"), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    const data = await response.json();
    assert.equal(data.priceUsd, 100);
    assert.equal(data.usdZar, 17.5);
    assert.deepEqual(requestedUrls.sort(), [
      "https://query1.finance.yahoo.com/v8/finance/chart/STRC?range=1y&interval=1d&events=div",
      "https://query1.finance.yahoo.com/v8/finance/chart/USDZAR=X?range=5d&interval=1d",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("adds CORS headers to previously cached STRC responses", async () => {
  const originalCaches = globalThis.caches;
  globalThis.caches = {
    default: {
      match: async () => new Response('{"symbol":"STRC"}', {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
      }),
    },
  };
  try {
    const response = await worker.fetch(new Request("https://funds.example/api/strc"), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    assert.equal((await response.json()).symbol, "STRC");
  } finally {
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
  }
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
  const postQuote = await worker.fetch(
    new Request("https://funds.example/api/strc", { method: "POST" }),
    { ASSETS: assets },
  );
  assert.equal(postQuote.status, 405);
});
