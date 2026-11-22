const PRODUCT_ID = "absa-45-day-notice";
const PRODUCT_SOURCE = "https://www.absa.co.za/personal/";

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
  const maximum = name === "ABSA_ANNUAL_RATE_PERCENT" ? 100 : Infinity;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(`${name} must be a number from 0 to ${maximum}`);
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/funds") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method not allowed" }, 405, { Allow: "GET" });
      }
      return handleFunds(env);
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
