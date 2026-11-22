import test from "node:test";
import assert from "node:assert/strict";
import worker, {
  buildFundData,
  buildJseShareData,
  buildStrcData,
  parseAbsaNoticeSelectHtml,
  parseUnumAlphaUpgradeHtml,
} from "../cloudflare/worker.js";

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

const SAMPLE_UNUM_ALPHA_UPGRADE_HTML = `
<div class="et_pb_text_inner">
  <h1><strong>Debt Fund</strong></h1>
  <p><strong>Alpha Upgrade</strong></p>
  <h2><strong>Projected Returns</strong></h2>
  <p>The Alpha Upgrade Fund is designed for investors seeking consistent high yield returns in excess of its CPI + 8% benchmark. The fund targets an annual return of 18% &#8211; 25%.</p>
</div>
`;

test("parses the 45-day Notice Select standard rate, minimum deposit, and review date from Absa HTML", () => {
  const parsed = parseAbsaNoticeSelectHtml(SAMPLE_ABSA_NOTICE_SELECT_HTML, new Date("2026-11-22T12:00:00.000Z"));
  assert.ok(parsed);
  assert.equal(parsed.minimumInvestmentZar, 1000);
  assert.equal(parsed.annualRatePercent, 7.35);
  assert.equal(parsed.rateAsOf, "2026-09-25");
});

test("parses the target annual return range from Unum Alpha Upgrade HTML with R50,000 minimum and 18.4% return rate", () => {
  const parsed = parseUnumAlphaUpgradeHtml(SAMPLE_UNUM_ALPHA_UPGRADE_HTML, new Date("2026-11-22T12:00:00.000Z"));
  assert.ok(parsed);
  assert.equal(parsed.minimumInvestmentZar, 50000);
  assert.equal(parsed.annualRatePercent, 18.4);
  assert.equal(parsed.targetReturnMinPercent, 18);
  assert.equal(parsed.targetReturnMaxPercent, 25);
  assert.equal(parsed.rateAsOf, "2026-11-22");
});

test("returns the Absa notice account and Unum Alpha Upgrade Fund and leaves unverified figures blank", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");
  const data = buildFundData({}, now);
  assert.equal(data.updatedAt, now.toISOString());
  assert.equal(data.funds.length, 2);
  assert.equal(data.funds[0].id, "absa-45-day-notice");
  assert.equal(data.funds[0].minimumInvestmentZar, null);
  assert.equal(data.funds[0].annualRatePercent, null);
  assert.equal(data.funds[0].category, "Notice deposit account");
  assert.equal(data.funds[0].source.url, "https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select");

  assert.equal(data.funds[1].id, "unum-alpha-upgrade");
  assert.equal(data.funds[1].minimumInvestmentZar, null);
  assert.equal(data.funds[1].annualRatePercent, null);
  assert.equal(data.funds[1].access, "30 days' notice");
  assert.equal(data.funds[1].source.url, "https://koinz.co.za/alpha-upgrade-debt-fund/");
});

test("accepts explicitly configured rate and minimum with a source date", () => {
  const data = buildFundData({
    ABSA_MINIMUM_ZAR: "1000",
    ABSA_ANNUAL_RATE_PERCENT: "7.5",
    ABSA_RATE_AS_OF: "2026-11-22",
    UNUM_MINIMUM_ZAR: "100000",
    UNUM_ANNUAL_RATE_PERCENT: "18",
    UNUM_RATE_AS_OF: "2026-11-22",
  });
  assert.equal(data.funds[0].minimumInvestmentZar, 1000);
  assert.equal(data.funds[0].annualRatePercent, 7.5);
  assert.equal(data.funds[0].rateAsOf, "2026-11-22");
  assert.equal(data.funds[1].minimumInvestmentZar, 100000);
  assert.equal(data.funds[1].annualRatePercent, 18);
  assert.equal(data.funds[1].rateAsOf, "2026-11-22");
});

test("rejects malformed configuration instead of publishing invalid figures", () => {
  assert.throws(() => buildFundData({ ABSA_ANNUAL_RATE_PERCENT: "-2" }), /number from 0 to 100/);
  assert.throws(() => buildFundData({ ABSA_ANNUAL_RATE_PERCENT: "101" }), /number from 0 to 100/);
  assert.throws(() => buildFundData({ ABSA_RATE_AS_OF: "22-11-2026" }), /YYYY-MM-DD/);
  assert.throws(() => buildFundData({ UNUM_ANNUAL_RATE_PERCENT: "120" }), /number from 0 to 100/);
  assert.throws(() => buildFundData({ UNUM_RATE_AS_OF: "22/11/2026" }), /YYYY-MM-DD/);
});

test("GET /api/funds downloads Absa and Unum pages, caches for one week, and rejects non-GET requests", async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    requestedUrls.push(urlStr);
    const html = urlStr.includes("koinz.co.za") ? SAMPLE_UNUM_ALPHA_UPGRADE_HTML : SAMPLE_ABSA_NOTICE_SELECT_HTML;
    return new Response(html, {
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
    assert.equal(payload.funds.length, 2);
    assert.equal(payload.funds[0].minimumInvestmentZar, 1000);
    assert.equal(payload.funds[0].annualRatePercent, 7.35);
    assert.equal(payload.funds[0].rateAsOf, "2026-09-25");
    assert.equal(payload.funds[1].id, "unum-alpha-upgrade");
    assert.equal(payload.funds[1].minimumInvestmentZar, 50000);
    assert.equal(payload.funds[1].annualRatePercent, 18.4);
    assert.deepEqual(requestedUrls.sort(), [
      "https://koinz.co.za/alpha-upgrade-debt-fund/",
      "https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select",
    ]);

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

test("builds JSE trailing dividend yields from cent-denominated quotes and dividend events", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const result = buildJseShareData({
    chart: {
      result: [{
        meta: {
          symbol: "MRF.JO",
          currency: "ZAc",
          regularMarketPrice: 135,
          regularMarketTime: nowSeconds - 3600,
        },
        events: {
          dividends: {
            recent: { date: nowSeconds - 30 * 86400, amount: 16 },
            older: { date: nowSeconds - 250 * 86400, amount: 8 },
            expired: { date: nowSeconds - 366 * 86400, amount: 50 },
            future: { date: nowSeconds + 86400, amount: 20 },
          },
        },
      }],
    },
  }, {
    symbol: "MRF.JO",
    ticker: "MRF",
    name: "Merafe Resources Limited",
  }, now);

  assert.equal(result.priceZar, 1.35);
  assert.equal(result.trailingDividendPerShareZar, 0.24);
  assert.equal(result.trailingDividendYieldPercent, 0.24 / 1.35 * 100);
  assert.equal(result.trailingDividendEvents, 2);
  assert.equal(result.sourceUrl, "https://finance.yahoo.com/quote/MRF.JO/");
});

test("rejects JSE quote data reported in an unexpected currency", () => {
  assert.throws(() => buildJseShareData({
    chart: {
      result: [{
        meta: {
          symbol: "MRF.JO",
          currency: "ZAR",
          regularMarketPrice: 1.35,
          regularMarketTime: Math.floor(Date.now() / 1000),
        },
      }],
    },
  }, { symbol: "MRF.JO", ticker: "MRF", name: "Merafe Resources Limited" }), /quote data was invalid/);
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

test("GET /api/jse-shares fetches the three JSE tickers and returns a five-minute cache header", async () => {
  const originalFetch = globalThis.fetch;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const prices = { "MRF.JO": 135, "TBS.JO": 26132, "CAT.JO": 1190 };
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const urlString = String(url);
    requestedUrls.push(urlString);
    const symbol = Object.keys(prices).find((ticker) => urlString.includes(`/${ticker}?`));
    return Response.json({
      chart: {
        result: [{
          meta: {
            symbol,
            currency: "ZAc",
            regularMarketPrice: prices[symbol],
            regularMarketTime: nowSeconds,
          },
          events: {
            dividends: {
              recent: { date: nowSeconds - 86400, amount: 100 },
            },
          },
        }],
      },
    });
  };
  try {
    const response = await worker.fetch(new Request("https://funds.example/api/jse-shares"), {});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "public, max-age=300");
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
    const data = await response.json();
    assert.deepEqual(data.shares.map((share) => share.ticker), ["MRF", "TBS", "CAT"]);
    assert.equal(data.shares[0].priceZar, 1.35);
    assert.deepEqual(requestedUrls.sort(), [
      "https://query1.finance.yahoo.com/v8/finance/chart/CAT.JO?range=1y&interval=1d&events=div",
      "https://query1.finance.yahoo.com/v8/finance/chart/MRF.JO?range=1y&interval=1d&events=div",
      "https://query1.finance.yahoo.com/v8/finance/chart/TBS.JO?range=1y&interval=1d&events=div",
    ]);

    const postResponse = await worker.fetch(
      new Request("https://funds.example/api/jse-shares", { method: "POST" }),
      {},
    );
    assert.equal(postResponse.status, 405);
    assert.equal(postResponse.headers.get("Allow"), "GET");
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
