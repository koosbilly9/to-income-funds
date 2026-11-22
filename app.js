(function (root) {
  "use strict";

  var DEFAULT_TARGET = 300000;
  var SETTINGS_KEY = "income-funds-settings-v1";
  var WORKER_URL = "https://investment-funds.koosbilly9.workers.dev";

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

  function formatRand(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0
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
    return root.fetch(apiUrl("/api/funds"), { headers: { Accept: "application/json" } }).then(function (response) {
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

  function renderFund(fund) {
    var targetInput = root.document.getElementById("annual-target");
    var tbody = root.document.getElementById("funds");
    var dataNoteEl = root.document.getElementById("data-note");
    var rate = number(fund.annualRatePercent);
    var minimumValue = number(fund.minimumInvestmentZar);

    function update() {
      var target = number(targetInput.value);
      var balance = requiredBalance(target, rate);
      var validTarget = Number.isFinite(target) && target > 0;
      var validRate = Number.isFinite(rate) && rate > 0 && rate <= 100;
      var hasRate = Number.isFinite(rate) && rate >= 0 && rate <= 100;
      var hasMinimum = Number.isFinite(minimumValue);
      var minimum = hasMinimum
        ? formatRand(minimumValue)
        : '<span class="unverified">Not verified</span>';
      var annualReturn = hasRate ? rate.toFixed(2) + "% gross p.a." : '<span class="unverified">Not verified</span>';
      var balanceText = validTarget && validRate ? formatRand(balance) : "—";
      var access = typeof fund.access === "string" ? fund.access : "—";
      tbody.innerHTML =
        '<tr><td><div class="product"><span class="product-mark" aria-hidden="true">A</span><div><div class="product-name">' +
        escapeHtml(fund.name) + '</div><div class="product-type">' + escapeHtml(fund.category) +
        '</div></div></div></td><td>' + minimum + '</td><td>' + annualReturn +
        '</td><td>' + balanceText + '</td><td>' + escapeHtml(access) + "</td></tr>";
      if (hasRate) {
        var dateText = typeof fund.rateAsOf === "string" ? " as of " + fund.rateAsOf : "";
        dataNoteEl.innerHTML = "<strong>Worker data" + escapeHtml(dateText) + ".</strong> " +
          (hasMinimum ? "The minimum and rate were configured for this page." : "The minimum buy-in is still unverified.") +
          ' Confirm current terms and balance tiers with <a href="https://www.absa.co.za/personal/" target="_blank" rel="noopener">Absa</a>.';
      } else {
        dataNoteEl.innerHTML = hasMinimum
          ? "<strong>Rate not configured.</strong> The minimum buy-in is set in the Worker, but the current rate is still needed for an estimate."
          : "<strong>Rate/minimum not verified.</strong> ABSA rates and opening amounts can change and may depend on the balance tier. " +
            'Set confirmed product details in the Worker and check current terms with <a href="https://www.absa.co.za/personal/" target="_blank" rel="noopener">Absa</a>.';
      }
    }

    targetInput.addEventListener("input", update);
    update();
  }

  function renderStrc(data) {
    var targetInput = root.document.getElementById("annual-target");
    var tbody = root.document.getElementById("strc");
    var note = root.document.getElementById("strc-note");
    var updated = root.document.getElementById("strc-updated");

    function update() {
      var target = number(targetInput.value);
      var shares = targetShares(target, number(data.trailingDividendPerShareUsd), number(data.usdZar));
      var yieldPercent = number(data.trailingDividendYieldPercent);
      var hasYield = Number.isFinite(yieldPercent) && yieldPercent >= 0;
      var shareCount = shares === null
        ? "—"
        : new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(shares);
      var yieldText = hasYield
        ? yieldPercent.toFixed(2) + "%"
        : '<span class="unverified">Unavailable</span>';
      tbody.innerHTML =
        '<tr><td><div class="product"><span class="product-mark" aria-hidden="true">S</span><div><div class="product-name">Strategy Inc.</div>' +
        '<div class="product-type">Variable Rate Series A Perpetual Stretch · <a href="https://finance.yahoo.com/quote/STRC/" target="_blank" rel="noopener">STRC</a></div></div></div></td>' +
        '<td>' + formatUsd(number(data.priceUsd)) + '</td><td>' + yieldText + '</td><td>' + shareCount + "</td></tr>";

      if (shares === null) {
        note.textContent = "A complete trailing dividend history and a current USD/ZAR rate are needed to estimate target shares.";
      } else {
        var fxDate = data.usdZarAsOf
          ? " as of " + new Date(data.usdZarAsOf).toLocaleDateString()
          : "";
        note.textContent = "Trailing 12-month dividends: " + formatUsd(number(data.trailingDividendPerShareUsd)) +
          " per share. USD/ZAR: " + number(data.usdZar).toFixed(4) + fxDate +
          ". Target shares are rounded up using this historical payout; future dividends may differ.";
      }
    }

    updated.textContent = data.priceAsOf
      ? "Price as of " + new Date(data.priceAsOf).toLocaleString()
      : "Market data loaded";
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
    if (Number.isFinite(savedTarget) && savedTarget > 0) {
      targetInput.value = String(savedTarget);
    }
    targetInput.addEventListener("input", function () {
      var target = number(targetInput.value);
      if (Number.isFinite(target) && target > 0) saveSettings({ target: target });
    });

    requestFunds().then(function (payload) {
      var fund = payload.funds.find(function (item) { return item.id === "absa-45-day-notice"; });
      renderFund(fund);
      status.textContent = "Absa data loaded";
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
      root.document.getElementById("strc").innerHTML =
        '<tr><td colspan="4">STRC price and dividend data could not be loaded.</td></tr>';
      root.document.getElementById("strc-note").textContent = error.message;
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      DEFAULT_TARGET: DEFAULT_TARGET,
      apiUrl: apiUrl,
      formatRand: formatRand,
      requiredBalance: requiredBalance,
      targetShares: targetShares,
      validFundPayload: validFundPayload
    };
  }
  if (root.document) init();
})(typeof globalThis !== "undefined" ? globalThis : this);
