(function (root) {
  "use strict";

  var DEFAULT_TARGET = 300000;
  var SETTINGS_KEY = "income-funds-settings-v1";
  var WORKER_URL = "https://investment-funds.koosbilly9.workers.dev";
  var dividendShareRows = {
    strc: '<tr><td colspan="5">Loading STRC price and dividend history…</td></tr>',
    jse: '<tr><td colspan="5">Loading JSE share prices and dividend history…</td></tr>'
  };

  function renderDividendShareRows() {
    var tbody = root.document.getElementById("dividend-shares");
    tbody.innerHTML = dividendShareRows.strc + dividendShareRows.jse;
  }

  function apiUrl(path, hostname) {
    var host = typeof hostname === "string"
      ? hostname
      : root.location && root.location.hostname;
    return (host === "koosbilly9.github.io" ? WORKER_URL : "") + path;
  }

  function number(value) {
    if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return NaN;
    return Number(value);
  }

  function monthlyIncomeBreakdown(annualIncomeGoal) {
    if (!Number.isFinite(annualIncomeGoal) || annualIncomeGoal <= 0) return null;
    var gross = annualIncomeGoal / 12;
    var taxEstimate = annualIncomeGoal * 0.2 / 12;
    return {
      gross: gross,
      taxEstimate: taxEstimate,
      net: gross - taxEstimate
    };
  }

  function formatRand(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0
    }).format(value);
  }

  function formatRandShareAmount(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function requiredBalance(target, annualRatePercent) {
    if (!Number.isFinite(target) || target <= 0 ||
        !Number.isFinite(annualRatePercent) || annualRatePercent <= 0) {
      return null;
    }
    return target / (annualRatePercent / 100);
  }

  function targetShares(targetZar, trailingDividendPerShareUsd, usdZar) {
    if (!Number.isFinite(targetZar) || targetZar <= 0 ||
        !Number.isFinite(trailingDividendPerShareUsd) || trailingDividendPerShareUsd <= 0 ||
        !Number.isFinite(usdZar) || usdZar <= 0) {
      return null;
    }
    return Math.ceil(targetZar / (trailingDividendPerShareUsd * usdZar));
  }

  function totalShareCostZar(shares, priceUsd, usdZar) {
    if (!Number.isFinite(shares) || shares <= 0 ||
        !Number.isFinite(priceUsd) || priceUsd <= 0 ||
        !Number.isFinite(usdZar) || usdZar <= 0) {
      return null;
    }
    return shares * priceUsd * usdZar;
  }

  function validFundPayload(payload) {
    if (!payload || !Array.isArray(payload.funds) ||
        !payload.funds.some(function (fund) { return fund && fund.id === "absa-45-day-notice"; })) {
      throw new Error("Fund details response was invalid");
    }
    return payload;
  }

  function readSettings() {
    try {
      var value = JSON.parse(root.localStorage.getItem(SETTINGS_KEY));
      return value && typeof value === "object" ? value : {};
    } catch (error) {
      console.warn("Could not read saved fund settings:", error);
      return {};
    }
  }

  function saveSettings(settings) {
    try {
      root.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("Could not save fund settings:", error);
    }
  }

  function requestFunds() {
    return root.fetch(apiUrl("/api/funds?v=3"), { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("Fund details request failed (HTTP " + response.status + ")");
      return response.json();
    }).then(validFundPayload);
  }

  function requestStrc() {
    return root.fetch(apiUrl("/api/strc?v=2"), { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("STRC market data request failed (HTTP " + response.status + ")");
      return response.json();
    }).then(function (payload) {
      if (!payload || payload.symbol !== "STRC" ||
          !Number.isFinite(number(payload.priceUsd)) ||
          !Number.isFinite(number(payload.usdZar))) {
        throw new Error("STRC market data response was invalid");
      }
      return payload;
    });
  }

  function requestJseShares() {
    return root.fetch(apiUrl("/api/jse-shares?v=1"), { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("JSE share market data request failed (HTTP " + response.status + ")");
      return response.json();
    }).then(function (payload) {
      var expectedSymbols = ["MRF.JO", "TBS.JO", "CAT.JO"];
      if (!payload || !Array.isArray(payload.shares) ||
          !expectedSymbols.every(function (symbol) {
            return payload.shares.some(function (share) {
              return share && share.symbol === symbol &&
                Number.isFinite(number(share.priceZar)) &&
                (share.trailingDividendPerShareZar === null ||
                  Number.isFinite(number(share.trailingDividendPerShareZar)));
            });
          })) {
        throw new Error("JSE share market data response was invalid");
      }
      return payload;
    });
  }

  function renderFunds(funds) {
    var targetInput = root.document.getElementById("annual-target");
    var tbody = root.document.getElementById("funds");
    var dataNoteEl = root.document.getElementById("data-note");
    var list = Array.isArray(funds) ? funds : [funds];

    function productMark(fund) {
      if (fund && fund.id === "unum-alpha-upgrade") return "U";
      return "A";
    }

    function productUrl(fund) {
      if (fund && fund.source && typeof fund.source.url === "string" && fund.source.url) {
        return fund.source.url;
      }
      if (fund && fund.id === "unum-alpha-upgrade") {
        return "https://koinz.co.za/alpha-upgrade-debt-fund/";
      }
      return "https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select";
    }

    function formatReturnLabel(fund, rate) {
      if (fund && fund.id === "unum-alpha-upgrade") {
        return rate.toFixed(2) + "% target p.a. (18%–25%)";
      }
      return rate.toFixed(2) + "% gross p.a.";
    }

    function update() {
      var target = number(targetInput.value);
      var validTarget = Number.isFinite(target) && target > 0;

      tbody.innerHTML = list.map(function (fund) {
        var rate = number(fund.annualRatePercent);
        var minimumValue = number(fund.minimumInvestmentZar);
        var balance = requiredBalance(target, rate);
        var validRate = Number.isFinite(rate) && rate > 0 && rate <= 100;
        var hasRate = Number.isFinite(rate) && rate >= 0 && rate <= 100;
        var hasMinimum = Number.isFinite(minimumValue);
        var minimum = hasMinimum
          ? formatRand(minimumValue)
          : '<span class="unverified">Not verified</span>';
        var annualReturn = hasRate
          ? formatReturnLabel(fund, rate)
          : '<span class="unverified">Not verified</span>';
        var balanceText = validTarget && validRate ? formatRand(balance) : "—";
        var access = typeof fund.access === "string" ? fund.access : "—";
        var mark = productMark(fund);
        var url = productUrl(fund);

        return '<tr><td><div class="product"><span class="product-mark" aria-hidden="true">' + mark +
          '</span><div><div class="product-name"><a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">' +
          escapeHtml(fund.name) + '</a></div><div class="product-type">' + escapeHtml(fund.category) +
          '</div></div></div></td><td>' + minimum + '</td><td>' + annualReturn +
          '</td><td>' + balanceText + '</td><td>' + escapeHtml(access) + "</td></tr>";
      }).join("");

      var absa = list.find(function (item) { return item && item.id === "absa-45-day-notice"; }) || list[0];
      var unum = list.find(function (item) { return item && item.id === "unum-alpha-upgrade"; });
      var absaRate = absa ? number(absa.annualRatePercent) : NaN;
      var hasAbsaRate = Number.isFinite(absaRate) && absaRate >= 0 && absaRate <= 100;
      var absaUrl = absa && absa.source && typeof absa.source.url === "string"
        ? absa.source.url
        : "https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select";
      var unumUrl = unum && unum.source && typeof unum.source.url === "string"
        ? unum.source.url
        : "https://koinz.co.za/alpha-upgrade-debt-fund/";
      var unumFactsheetUrl = unum && unum.source && typeof unum.source.factsheetUrl === "string"
        ? unum.source.factsheetUrl
        : "https://unum.co.za/wp-content/uploads/2025/04/Alpha-Upgrade.pdf";

      if (hasAbsaRate) {
        var dateText = absa && typeof absa.rateAsOf === "string" ? " as of " + absa.rateAsOf : "";
        dataNoteEl.innerHTML = "<strong>Weekly source data" + escapeHtml(dateText) + ".</strong> " +
          'Absa 45-day Notice Select uses the 100/0 standard opening rate from <a href="' + escapeHtml(absaUrl) + '" target="_blank" rel="noopener">Absa</a>. ' +
          'Unum Alpha Upgrade uses a R50,000 minimum buy-in and 18.4% annual return rate (within the 18%–25% target range) from <a href="' + escapeHtml(unumUrl) + '" target="_blank" rel="noopener">Unum / Koinz</a> ' +
          '(<a href="' + escapeHtml(unumFactsheetUrl) + '" target="_blank" rel="noopener">fact sheet PDF</a>).';
      } else {
        dataNoteEl.innerHTML =
          "<strong>Rate/minimum not verified.</strong> Rates and opening amounts can change and may depend on balance tiers or onboarding terms. " +
          'Check current schedules with <a href="' + escapeHtml(absaUrl) + '" target="_blank" rel="noopener">Absa</a> and ' +
          '<a href="' + escapeHtml(unumUrl) + '" target="_blank" rel="noopener">Unum / Koinz</a>.';
      }
    }

    targetInput.addEventListener("input", update);
    update();
  }

  function renderStrc(data) {
    var targetInput = root.document.getElementById("annual-target");
    var note = root.document.getElementById("strc-note");
    var updated = root.document.getElementById("strc-updated");

    function update() {
      var target = number(targetInput.value);
      var shares = targetShares(target, number(data.trailingDividendPerShareUsd), number(data.usdZar));
      var cost = totalShareCostZar(shares, number(data.priceUsd), number(data.usdZar));
      var yieldPercent = number(data.trailingDividendYieldPercent);
      var hasYield = Number.isFinite(yieldPercent) && yieldPercent >= 0;
      var shareCount = shares === null
        ? "—"
        : new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(shares);
      var costText = cost === null ? "—" : formatRand(cost);
      var yieldText = hasYield
        ? yieldPercent.toFixed(2) + "%"
        : '<span class="unverified">Unavailable</span>';
      dividendShareRows.strc =
        '<tr><td><div class="product"><span class="product-mark" aria-hidden="true">S</span><div><div class="product-name"><a href="https://finance.yahoo.com/quote/STRC/" target="_blank" rel="noopener">Strategy Inc.</a></div>' +
        '<div class="product-type">Variable Rate Series A Perpetual Stretch · <a href="https://finance.yahoo.com/quote/STRC/" target="_blank" rel="noopener">STRC</a></div></div></div></td>' +
        '<td>' + formatUsd(number(data.priceUsd)) + '</td><td>' + yieldText + '</td><td>' + shareCount +
        '</td><td>' + costText + "</td></tr>";
      renderDividendShareRows();

      if (shares === null) {
        note.textContent = "A complete trailing dividend history and a current USD/ZAR rate are needed to estimate target shares.";
      } else {
        var fxDate = data.usdZarAsOf
          ? " as of " + new Date(data.usdZarAsOf).toLocaleDateString()
          : "";
        note.textContent = "Trailing 12-month dividends: " + formatUsd(number(data.trailingDividendPerShareUsd)) +
          " per share. USD/ZAR: " + number(data.usdZar).toFixed(4) + fxDate +
          ". Target shares are rounded up using this historical payout; estimated cost uses the current exchange rate and excludes fees and taxes.";
      }
    }

    updated.textContent = data.priceAsOf
      ? "Price as of " + new Date(data.priceAsOf).toLocaleString()
      : "Market data loaded";
    targetInput.addEventListener("input", update);
    update();
  }

  function renderJseShares(shares, updatedAt) {
    var targetInput = root.document.getElementById("annual-target");
    var note = root.document.getElementById("jse-shares-note");

    function update() {
      var target = number(targetInput.value);
      dividendShareRows.jse = shares.map(function (share) {
        var price = number(share.priceZar);
        var dividend = number(share.trailingDividendPerShareZar);
        var yieldPercent = number(share.trailingDividendYieldPercent);
        var validYield = Number.isFinite(yieldPercent) && yieldPercent >= 0;
        var hasDividend = Number.isFinite(dividend) && dividend > 0;
        var count = hasDividend ? targetShares(target, dividend, 1) : null;
        var cost = count === null ? null : totalShareCostZar(count, price, 1);
        var countText = count === null
          ? "—"
          : new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(count);
        var yieldText = validYield
          ? yieldPercent.toFixed(2) + "%" +
            (yieldPercent > 13 ? ' <span class="yield-qualifier">Above 13%</span>' : "")
          : '<span class="unverified">Unavailable</span>';

        return '<tr><td><div class="product"><span class="product-mark" aria-hidden="true">J</span><div>' +
          '<div class="product-name"><a href="' + escapeHtml(share.sourceUrl) + '" target="_blank" rel="noopener">' +
          escapeHtml(share.name) + '</a></div><div class="product-type">' + escapeHtml(share.ticker) +
          ' · JSE</div></div></div></td><td>' + formatRandShareAmount(price) + '</td><td>' +
          yieldText + '</td><td>' + countText + '</td><td>' +
          (cost === null ? "—" : formatRand(cost)) + "</td></tr>";
      }).join("");
      renderDividendShareRows();

      var updateText = updatedAt
        ? " JSE data updated " + new Date(updatedAt).toLocaleString() + "."
        : "";
      note.textContent = "JSE trailing 12-month dividends per share are added from Yahoo Finance events and compared with the current share price." +
        updateText + " A yield above 13% is historical, not a forecast; it may include one-off payouts and can fall if dividends or share prices change. Estimated share counts use this historical payout; costs exclude fees and taxes.";
    }

    targetInput.addEventListener("input", update);
    update();
  }

  function formatUsd(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function init() {
    if (!root.document) return;
    var status = root.document.getElementById("status");
    var updated = root.document.getElementById("updated");
    var targetInput = root.document.getElementById("annual-target");
    var settings = readSettings();
    var savedTarget = number(settings.target);
    var monthlyGross = root.document.getElementById("monthly-gross");
    var monthlyTax = root.document.getElementById("monthly-tax");
    var monthlyNet = root.document.getElementById("monthly-net");
    if (Number.isFinite(savedTarget) && savedTarget > 0) {
      targetInput.value = String(savedTarget);
    }
    function updateMonthlyIncome() {
      var breakdown = monthlyIncomeBreakdown(number(targetInput.value));
      monthlyGross.textContent = breakdown ? formatRand(breakdown.gross) : "—";
      monthlyTax.textContent = breakdown ? formatRand(breakdown.taxEstimate) : "—";
      monthlyNet.textContent = breakdown ? formatRand(breakdown.net) : "—";
    }

    updateMonthlyIncome();
    targetInput.addEventListener("input", updateMonthlyIncome);
    targetInput.addEventListener("input", function () {
      var target = number(targetInput.value);
      if (Number.isFinite(target) && target > 0) saveSettings({ target: target });
    });

    requestFunds().then(function (payload) {
      renderFunds(payload.funds);
      status.textContent = "Fund data loaded";
      updated.textContent = payload.updatedAt
        ? "Details loaded " + new Date(payload.updatedAt).toLocaleString()
        : "";
    }).catch(function (error) {
      console.error("Could not load fund details:", error);
      status.textContent = "Fund data unavailable";
      updated.textContent = "Could not load fund data";
      root.document.getElementById("funds").innerHTML =
        '<tr><td colspan="5">Fund data could not be loaded. Please try again later.</td></tr>';
      root.document.getElementById("data-note").textContent = error.message;
    });

    requestStrc().then(function (data) {
      renderStrc(data);
    }).catch(function (error) {
      console.error("Could not load STRC market data:", error);
      root.document.getElementById("strc-updated").textContent = "Could not load share data";
      dividendShareRows.strc =
        '<tr><td colspan="5">STRC price and dividend data could not be loaded.</td></tr>';
      renderDividendShareRows();
      root.document.getElementById("strc-note").textContent = error.message;
    });

    requestJseShares().then(function (payload) {
      renderJseShares(payload.shares, payload.updatedAt);
    }).catch(function (error) {
      console.error("Could not load JSE share market data:", error);
      dividendShareRows.jse =
        '<tr><td colspan="5">JSE share price and dividend data could not be loaded.</td></tr>';
      renderDividendShareRows();
      root.document.getElementById("jse-shares-note").textContent = error.message;
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DEFAULT_TARGET: DEFAULT_TARGET,
      apiUrl: apiUrl,
      formatRand: formatRand,
      monthlyIncomeBreakdown: monthlyIncomeBreakdown,
      requiredBalance: requiredBalance,
      totalShareCostZar: totalShareCostZar,
      targetShares: targetShares,
      validFundPayload: validFundPayload
    };
  }
  if (root.document) init();
})(typeof globalThis !== "undefined" ? globalThis : this);
