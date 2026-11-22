const PRODUCT_ID = "absa-45-day-notice";
const PRODUCT_SOURCE = "https://www.absa.co.za/personal/";
const STRC_URL = "https://query1.finance.yahoo.com/v8/finance/chart/STRC?range=1y&interval=1d&events=div";
const USD_ZAR_URL = "https://query1.finance.yahoo.com/v8/finance/chart/USDZAR=X?range=5d&interval=1d";
const ONE_YEAR_MS = 365.25 * 86400000;
const UPSTREAM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; investment-funds/1.0)",
};

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function optionalNumber(value, name) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  const isRate = name === "ABSA_ANNUAL_RATE_PERCENT";
  if (!Number.isFinite(parsed) || parsed < 0 || (isRate && parsed > 100)) {
    throw new Error(isRate ? `${name} must be a number from 0 to 100` : `${name} must be a non-negative number`);
  }
  return parsed;
}

export function buildFundData(env = {}, now = new Date()) {
  const minimumInvestmentZar = optionalNumber(env.ABSA_MINIMUM_ZAR, "ABSA_MINIMUM_ZAR");
  const annualRatePercent = optionalNumber(env.ABSA_ANNUAL_RATE_PERCENT, "ABSA_ANNUAL_RATE_PERCENT");
  const rateAsOf = env.ABSA_RATE_AS_OF || null;
  if (rateAsOf !== null && !/^\d{4}-\d{2}-\d{2}$/.test(rateAsOf)) {
    throw new Error("ABSA_RATE_AS_OF must use YYYY-MM-DD format");
  }

  return {
    updatedAt: now.toISOString(),
    targetAnnualIncomeZar: 300000,
    funds: [{
      id: PRODUCT_ID,
      name: "Absa 45-day Personal Notice",
      category: "Notice deposit account",
      currency: "ZAR",
      minimumInvestmentZar,
      annualRatePercent,
      rateAsOf,
      returnType: "Gross annual interest; variable rate",
      access: "45 days' notice",
      source: {
        name: "Absa",
        url: PRODUCT_SOURCE,
      },
    }],
  };
}

function chartResult(payload, symbol) {
  const result = payload && payload.chart && Array.isArray(payload.chart.result) && payload.chart.result[0];
  if (!result || (result.meta && result.meta.symbol !== symbol)) {
    throw new Error(`${symbol} chart response was invalid`);
  }
  return result;
}

export function buildStrcData(stockPayload, fxPayload, now = Date.now()) {
  const stock = chartResult(stockPayload, "STRC");
  const fx = chartResult(fxPayload, "USDZAR=X");
  const priceUsd = Number(stock.meta && stock.meta.regularMarketPrice);
  const usdZar = Number(fx.meta && fx.meta.regularMarketPrice);
  const priceTime = Number(stock.meta && stock.meta.regularMarketTime);
  const fxTime = Number(fx.meta && fx.meta.regularMarketTime);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0 ||
      !Number.isFinite(usdZar) || usdZar <= 0 ||
      !Number.isSafeInteger(priceTime) || !Number.isSafeInteger(fxTime)) {
    throw new Error("STRC quote or USD/ZAR rate was invalid");
  }

  const nowMs = now instanceof Date ? now.getTime() : now;
  const cutoff = Math.floor((nowMs - ONE_YEAR_MS) / 1000);
  const dividendEvents = stock.events && stock.events.dividends
    ? Object.values(stock.events.dividends)
    : [];
  let trailingDividendPerShareUsd = 0;
  let eventCount = 0;
  for (const event of dividendEvents) {
    const date = Number(event && event.date);
    const amount = Number(event && event.amount);
    if (Number.isSafeInteger(date) && date >= cutoff && date <= nowMs / 1000 &&
        Number.isFinite(amount) && amount > 0) {
      trailingDividendPerShareUsd += amount;
      eventCount++;
    }
  }
  if (!eventCount) trailingDividendPerShareUsd = null;
  const trailingDividendYieldPercent = trailingDividendPerShareUsd === null
    ? null
    : trailingDividendPerShareUsd / priceUsd * 100;

  return {
    symbol: "STRC",
    name: "Strategy Inc. Variable Rate Series A Perpetual Stretch Preferred Stock",
    currency: "USD",
    priceUsd,
    priceAsOf: new Date(priceTime * 1000).toISOString(),
    trailingDividendPerShareUsd,
    trailingDividendEvents: eventCount,
    trailingDividendYieldPercent,
    usdZar,
    usdZarAsOf: new Date(fxTime * 1000).toISOString(),
    source: "Yahoo Finance",
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: UPSTREAM_HEADERS,
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Market data source returned HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function handleStrc(request, ctx) {
  const cache = typeof caches !== "undefined" && caches ? caches.default : null;
  const cacheKey = new Request(new URL("/api/strc", request.url), { method: "GET" });
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) return new Response(cached.body, cached);
    } catch (error) {
      console.error("STRC cache lookup failed:", error);
    }
  }

  try {
    const [stockPayload, fxPayload] = await Promise.all([
      fetchJson(STRC_URL),
      fetchJson(USD_ZAR_URL),
    ]);
    const response = jsonResponse(buildStrcData(stockPayload, fxPayload), 200, {
      "Cache-Control": "public, max-age=300",
    });
    if (cache) {
      const putPromise = cache.put(cacheKey, response.clone()).catch((error) => {
        console.error("STRC cache write failed:", error);
      });
      if (ctx && typeof ctx.waitUntil === "function") {
        ctx.waitUntil(putPromise);
      } else {
        await putPromise;
      }
    }
    return response;
  } catch (error) {
    console.error("STRC market data request failed:", error);
    return jsonResponse({ error: "STRC market data is unavailable" }, 502);
  }
}

async function handleFunds(env) {
  try {
    return jsonResponse(buildFundData(env), 200, {
      "Cache-Control": "public, max-age=60",
    });
  } catch (error) {
    console.error("Fund data configuration is invalid:", error);
    return jsonResponse({ error: "Fund data configuration is invalid" }, 500);
  }
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/funds") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET" });
      }
      return handleFunds(env);
    }
    if (url.pathname === "/api/strc") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET" });
      }
      return handleStrc(request, ctx);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET, HEAD" });
    }
    return env.ASSETS.fetch(request);
  },
};
