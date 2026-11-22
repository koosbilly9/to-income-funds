const PRODUCT_ID = "absa-45-day-notice";
const PRODUCT_SOURCE = "https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select";
const UNUM_PRODUCT_ID = "unum-alpha-upgrade";
const UNUM_PRODUCT_SOURCE = "https://koinz.co.za/alpha-upgrade-debt-fund/";
const UNUM_FACTSHEET_SOURCE = "https://unum.co.za/wp-content/uploads/2025/04/Alpha-Upgrade.pdf";
const STRC_URL = "https://query1.finance.yahoo.com/v8/finance/chart/STRC?range=1y&interval=1d&events=div";
const USD_ZAR_URL = "https://query1.finance.yahoo.com/v8/finance/chart/USDZAR=X?range=5d&interval=1d";
const ONE_YEAR_MS = 365.25 * 86400000;
const ONE_WEEK_SECONDS = 7 * 86400;
const UPSTREAM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; investment-funds/1.0)",
};
const HTML_UPSTREAM_HEADERS = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent": "Mozilla/5.0 (compatible; investment-funds/1.0)",
};
const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  septmber: "09",
  october: "10",
  november: "11",
  december: "12",
};

function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      ...headers,
    },
  });
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function optionalNumber(value, name) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  const isRate = name.endsWith("_ANNUAL_RATE_PERCENT");
  if (!Number.isFinite(parsed) || parsed < 0 || (isRate && parsed > 100)) {
    throw new Error(isRate ? `${name} must be a number from 0 to 100` : `${name} must be a non-negative number`);
  }
  return parsed;
}

function stripHtml(value) {
  return String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseReviewedDate(sectionHtml, fallbackDate) {
  const text = stripHtml(sectionHtml);
  const match = /Last reviewed on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i.exec(text);
  if (match) {
    const day = String(Number(match[1])).padStart(2, "0");
    const month = MONTHS[match[2].toLowerCase()];
    const year = match[3];
    if (month && Number(day) >= 1 && Number(day) <= 31) {
      return `${year}-${month}-${day}`;
    }
  }
  const dateObj = fallbackDate instanceof Date ? fallbackDate : new Date(fallbackDate);
  return dateObj.toISOString().slice(0, 10);
}

export function parseAbsaNoticeSelectHtml(html, now = new Date()) {
  if (typeof html !== "string" || !html.trim()) return null;

  const startMatch = /title=["']notice-select["']|<h2[^>]*>\s*notice-select\s*<\/h2>/i.exec(html);
  if (!startMatch) return null;

  const afterStart = html.slice(startMatch.index);
  const endMatch = /<li[^>]+class=["'][^"']*accordion-slide|title=["']tax-free-savings["']/i.exec(afterStart.slice(1));
  const sectionHtml = endMatch ? afterStart.slice(0, endMatch.index + 1) : afterStart;

  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const tiers = [];
  let tableMatch;

  while ((tableMatch = tableRegex.exec(sectionHtml)) !== null) {
    const rows = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableMatch[1])) !== null) {
      const cells = [];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }
      if (cells.length) rows.push(cells);
    }

    const headingText = rows.slice(0, 3).map((r) => r.join(" | ")).join(" | ");
    if (!/Standard\s*Rate/i.test(headingText) || /Digital\s*Bonus/i.test(headingText)) {
      continue;
    }

    const balanceMatch = /Balance\s*R\s*([\d\s.,]+?)\s*(?:-|–|to)\s*R\s*([\d\s.,]+)/i.exec(headingText);
    if (!balanceMatch) continue;

    const minBalanceZar = Number(balanceMatch[1].replace(/[\s,]/g, ""));
    const maxBalanceZar = Number(balanceMatch[2].replace(/[\s,]/g, ""));
    if (!Number.isFinite(minBalanceZar) || !Number.isFinite(maxBalanceZar)) continue;

    let col45Index = -1;
    for (const row of rows) {
      const idx = row.findIndex((cell) => /\b45\s*Days\b/i.test(cell));
      if (idx !== -1) {
        col45Index = idx;
        break;
      }
    }
    if (col45Index === -1) continue;

    let rate100 = null;
    for (const row of rows) {
      if (/^100\s*\/\s*0+$/.test(row[0]) && row[col45Index]) {
        const rateMatch = /(\d+(?:\.\d+)?)\s*%/.exec(row[col45Index]);
        if (rateMatch) {
          rate100 = Number(rateMatch[1]);
          break;
        }
      }
    }

    if (Number.isFinite(rate100) && rate100 >= 0 && rate100 <= 100) {
      tiers.push({
        minBalanceZar,
        maxBalanceZar,
        annualRatePercent: rate100,
      });
    }
  }

  tiers.sort((a, b) => a.minBalanceZar - b.minBalanceZar);
  const substantiveTiers = tiers.filter((tier) => tier.minBalanceZar >= 1000 && tier.annualRatePercent > 0);
  const primaryTier = substantiveTiers[0] || tiers.find((tier) => tier.annualRatePercent > 0) || null;
  if (!primaryTier) return null;

  return {
    minimumInvestmentZar: primaryTier.minBalanceZar,
    annualRatePercent: primaryTier.annualRatePercent,
    rateAsOf: parseReviewedDate(sectionHtml, now),
    rateTiers: substantiveTiers.length ? substantiveTiers : tiers,
  };
}

export function parseUnumAlphaUpgradeHtml(html, now = new Date()) {
  if (typeof html !== "string" || !html.trim()) return null;
  const text = stripHtml(html);
  if (!/Alpha\s+Upgrade/i.test(text)) return null;

  const rangeMatch =
    /(?:targets?\s+an?\s+annual\s+return\s+of|annual\s+return\s+of|projected\s+returns?[^.]*?)\s*(\d+(?:\.\d+)?)\s*%\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*%/i.exec(
      text,
    );
  if (!rangeMatch) return null;

  const minRate = Number(rangeMatch[1]);
  const maxRate = Number(rangeMatch[2]);
  if (!Number.isFinite(minRate) || minRate <= 0 || minRate > 100 ||
      !Number.isFinite(maxRate) || maxRate < minRate || maxRate > 100) {
    return null;
  }

  let minimumInvestmentZar = null;
  const minMatch = /minimum\s+(?:investment|deposit|buy-in|lump\s+sum)[^.\d]*R\s*([\d\s,]+(?:\.\d+)?)/i.exec(text);
  if (minMatch) {
    const parsedMin = Number(minMatch[1].replace(/[\s,]/g, ""));
    if (Number.isFinite(parsedMin) && parsedMin >= 0) {
      minimumInvestmentZar = parsedMin;
    }
  }

  const dateObj = now instanceof Date ? now : new Date(now);
  return {
    minimumInvestmentZar,
    annualRatePercent: minRate,
    targetReturnMinPercent: minRate,
    targetReturnMaxPercent: maxRate,
    rateAsOf: dateObj.toISOString().slice(0, 10),
  };
}

function validateIsoDate(value, name) {
  if (value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }
}

export function buildFundData(env = {}, now = new Date(), scraped = null) {
  const absaScraped = scraped && scraped.absa !== undefined ? scraped.absa : scraped;
  const unumScraped = scraped && scraped.unum !== undefined ? scraped.unum : null;

  const envAbsaMin = optionalNumber(env.ABSA_MINIMUM_ZAR, "ABSA_MINIMUM_ZAR");
  const envAbsaRate = optionalNumber(env.ABSA_ANNUAL_RATE_PERCENT, "ABSA_ANNUAL_RATE_PERCENT");
  const envAbsaRateAsOf = env.ABSA_RATE_AS_OF || null;
  validateIsoDate(envAbsaRateAsOf, "ABSA_RATE_AS_OF");

  const envUnumMin = optionalNumber(env.UNUM_MINIMUM_ZAR, "UNUM_MINIMUM_ZAR");
  const envUnumRate = optionalNumber(env.UNUM_ANNUAL_RATE_PERCENT, "UNUM_ANNUAL_RATE_PERCENT");
  const envUnumRateAsOf = env.UNUM_RATE_AS_OF || null;
  validateIsoDate(envUnumRateAsOf, "UNUM_RATE_AS_OF");

  const absaMinimumZar = envAbsaMin !== null
    ? envAbsaMin
    : (absaScraped && Number.isFinite(absaScraped.minimumInvestmentZar) ? absaScraped.minimumInvestmentZar : null);
  const absaAnnualRatePercent = envAbsaRate !== null
    ? envAbsaRate
    : (absaScraped && Number.isFinite(absaScraped.annualRatePercent) ? absaScraped.annualRatePercent : null);
  const absaRateAsOf = envAbsaRateAsOf !== null
    ? envAbsaRateAsOf
    : (absaScraped && typeof absaScraped.rateAsOf === "string" ? absaScraped.rateAsOf : null);

  const unumMinimumZar = envUnumMin !== null
    ? envUnumMin
    : (unumScraped && Number.isFinite(unumScraped.minimumInvestmentZar) ? unumScraped.minimumInvestmentZar : null);
  const unumAnnualRatePercent = envUnumRate !== null
    ? envUnumRate
    : (unumScraped && Number.isFinite(unumScraped.annualRatePercent) ? unumScraped.annualRatePercent : null);
  const unumRateAsOf = envUnumRateAsOf !== null
    ? envUnumRateAsOf
    : (unumScraped && typeof unumScraped.rateAsOf === "string" ? unumScraped.rateAsOf : null);

  return {
    updatedAt: now.toISOString(),
    targetAnnualIncomeZar: 300000,
    funds: [
      {
        id: PRODUCT_ID,
        name: "Absa 45-day Personal Notice",
        category: "Notice deposit account",
        currency: "ZAR",
        minimumInvestmentZar: absaMinimumZar,
        annualRatePercent: absaAnnualRatePercent,
        rateAsOf: absaRateAsOf,
        returnType: "Gross annual interest; variable rate",
        access: "45 days' notice",
        source: {
          name: "Absa",
          url: PRODUCT_SOURCE,
        },
      },
      {
        id: UNUM_PRODUCT_ID,
        name: "Unum Alpha Upgrade Fund",
        category: "Alternative private debt fund · Unum Capital (kAUG)",
        currency: "ZAR",
        minimumInvestmentZar: unumMinimumZar,
        annualRatePercent: unumAnnualRatePercent,
        rateAsOf: unumRateAsOf,
        returnType: "Target annual return (18%–25% range); variable",
        access: "30 days' notice",
        source: {
          name: "Unum / Koinz",
          url: UNUM_PRODUCT_SOURCE,
          factsheetUrl: UNUM_FACTSHEET_SOURCE,
        },
      },
    ],
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
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
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

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: HTML_UPSTREAM_HEADERS,
      redirect: "follow",
      cf: {
        cacheEverything: true,
        cacheTtl: ONE_WEEK_SECONDS,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Absa rate page returned HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function handleFunds(request, env, ctx) {
  let baseline;
  try {
    baseline = buildFundData(env);
  } catch (error) {
    console.error("Fund data configuration is invalid:", error);
    return jsonResponse({ error: "Fund data configuration is invalid" }, 500);
  }

  const hasFullEnvOverride =
    baseline.funds.every((fund) => fund.minimumInvestmentZar !== null && fund.annualRatePercent !== null && fund.rateAsOf !== null);
  if (hasFullEnvOverride) {
    return jsonResponse(baseline, 200, {
      "Cache-Control": `public, max-age=${ONE_WEEK_SECONDS}`,
    });
  }

  const cache = typeof caches !== "undefined" && caches ? caches.default : null;
  const cacheKey = new Request(new URL("/api/funds?v=2", request.url), { method: "GET" });
  if (cache) {
    try {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const headers = new Headers(cached.headers);
        headers.set("Access-Control-Allow-Origin", "*");
        return new Response(cached.body, {
          status: cached.status,
          statusText: cached.statusText,
          headers,
        });
      }
    } catch (error) {
      console.error("Funds cache lookup failed:", error);
    }
  }

  const now = new Date();
  const [absaResult, unumResult] = await Promise.allSettled([
    fetchHtml(PRODUCT_SOURCE),
    fetchHtml(UNUM_PRODUCT_SOURCE),
  ]);

  let absaScraped = null;
  if (absaResult.status === "fulfilled") {
    absaScraped = parseAbsaNoticeSelectHtml(absaResult.value, now);
    if (!absaScraped) {
      console.error("Absa Notice Select rate table could not be parsed from upstream HTML");
    }
  } else {
    console.error("Absa rate page request failed:", absaResult.reason);
  }

  let unumScraped = null;
  if (unumResult.status === "fulfilled") {
    unumScraped = parseUnumAlphaUpgradeHtml(unumResult.value, now);
    if (!unumScraped) {
      console.error("Unum Alpha Upgrade return range could not be parsed from upstream HTML");
    }
  } else {
    console.error("Unum Alpha Upgrade page request failed:", unumResult.reason);
  }

  const payload = buildFundData(env, now, { absa: absaScraped, unum: unumScraped });
  const hasVerifiedData =
    payload.funds[0].minimumInvestmentZar !== null &&
    payload.funds[0].annualRatePercent !== null &&
    payload.funds[1].annualRatePercent !== null;
  const maxAge = hasVerifiedData ? ONE_WEEK_SECONDS : 60;
  const response = jsonResponse(payload, 200, {
    "Cache-Control": `public, max-age=${maxAge}`,
  });

  if (cache && hasVerifiedData) {
    const putPromise = cache.put(cacheKey, response.clone()).catch((error) => {
      console.error("Funds cache write failed:", error);
    });
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(putPromise);
    } else {
      await putPromise;
    }
  }

  return response;
}

export default {
  async fetch(request, env = {}, ctx) {
    const url = new URL(request.url);
    if ((url.pathname === "/api/funds" || url.pathname === "/api/strc") && request.method === "OPTIONS") {
      return optionsResponse();
    }
    if (url.pathname === "/api/funds") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET" });
      }
      return handleFunds(request, env, ctx);
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
