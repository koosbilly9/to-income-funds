(function (root) {
  "use strict";

  var DEFAULT_TARGET = 300000;
  var SETTINGS_KEY = "income-funds-settings-v1";

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
    return root.fetch("/api/funds", { headers: { Accept: "application/json" } }).then(function (response) {
      if (!response.ok) throw new Error("Fund details request failed (HTTP " + response.status + ")");
      return response.json();
    }).then(validFundPayload);
  }

  function renderFund(fund, initialSettings) {
    var rateInput = root.document.getElementById("annual-rate");
    var targetInput = root.document.getElementById("annual-target");
    var tbody = root.document.getElementById("funds");
    var requiredEl = root.document.getElementById("required-balance");
    var noteEl = root.document.getElementById("calculation-note");
    var dataNoteEl = root.document.getElementById("data-note");
    var goalCaption = root.document.getElementById("goal-caption");
    var rateFromServer = Number.isFinite(number(fund.annualRatePercent)) ? number(fund.annualRatePercent) : null;
    var settings = initialSettings;

    if (rateFromServer !== null) {
      rateInput.value = String(rateFromServer);
    } else if (Number.isFinite(number(settings.rate)) && number(settings.rate) >= 0) {
      rateInput.value = String(settings.rate);
    }

    if (Number.isFinite(number(settings.target)) && number(settings.target) > 0) {
      targetInput.value = String(settings.target);
    }

    function update() {
      var target = number(targetInput.value);
      var rate = number(rateInput.value);
      var balance = requiredBalance(target, rate);
      var validTarget = Number.isFinite(target) && target > 0;
      var validRate = Number.isFinite(rate) && rate > 0 && rate <= 100;
      var hasRate = Number.isFinite(rate) && rate >= 0 && rate <= 100;
      var hasMinimum = Number.isFinite(number(fund.minimumInvestmentZar));
      var minimum = Number.isFinite(number(fund.minimumInvestmentZar))
        ? formatRand(number(fund.minimumInvestmentZar))
        : '<span class="unverified">Not verified</span>';
      var annualReturn = hasRate ? rate.toFixed(2) + "% gross p.a." : '<span class="unverified">Not verified</span>';
      var balanceText = validTarget && validRate ? formatRand(balance) : "—";
      var goalText = validTarget ? formatRand(target) : "Enter a valid goal";
      var access = typeof fund.access === "string" ? fund.access : "—";
      tbody.innerHTML =
        '<tr><td><div class="product"><span class="product-mark" aria-hidden="true">A</span><div><div class="product-name">' +
        escapeHtml(fund.name) + '</div><div class="product-type">' + escapeHtml(fund.category) +
        '</div></div></div></td><td>' + minimum + '</td><td>' + annualReturn +
        '</td><td>' + balanceText + '</td><td>' + escapeHtml(access) + "</td></tr>";
      requiredEl.textContent = validTarget && validRate ? formatRand(balance) : "Enter a verified rate";
      goalCaption.textContent = goalText;
      noteEl.textContent = validTarget && validRate
        ? "About " + formatRand(target / 12) + " gross per month at a constant " + rate.toFixed(2) + "% rate."
        : "A positive annual rate is needed to calculate the required balance.";
      if (rateFromServer !== null) {
        var dateText = typeof fund.rateAsOf === "string" ? " as of " + fund.rateAsOf : "";
        dataNoteEl.innerHTML = "<strong>Worker data" + escapeHtml(dateText) + ".</strong> " +
          (hasMinimum ? "The minimum and rate were configured for this page." : "The minimum buy-in is still unverified.") +
          " Confirm current terms and balance tiers with Absa.";
      } else if (hasRate) {
        dataNoteEl.innerHTML = "<strong>Manually entered rate.</strong> This estimate uses your input; it has not been verified by the Worker. " +
          (hasMinimum ? "The minimum buy-in is configured in the Worker." : "The minimum buy-in is still unverified.") +
          " Confirm current terms and balance tiers with Absa.";
      } else {
        dataNoteEl.innerHTML = "<strong>Rate/minimum not verified.</strong> ABSA rates and opening amounts can change and may depend on the balance tier. " +
          "Enter the current published rate above; set confirmed product details in the Worker before relying on them.";
      }
      saveSettings({
        target: validTarget ? target : DEFAULT_TARGET,
        rate: rateFromServer === null && Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : null
      });
    }

    targetInput.addEventListener("input", update);
    rateInput.addEventListener("input", update);
    update();
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
    requestFunds().then(function (payload) {
      var fund = payload.funds.find(function (item) { return item.id === "absa-45-day-notice"; });
      renderFund(fund, readSettings());
      status.textContent = "One product";
      updated.textContent = payload.updatedAt
        ? "Details loaded " + new Date(payload.updatedAt).toLocaleString()
        : "";
    }).catch(function (error) {
      console.error("Could not load fund details:", error);
      status.textContent = "Fund data unavailable";
      updated.textContent = "Could not load fund data";
      root.document.getElementById("funds").innerHTML =
        '<tr><td colspan="5">Fund data could not be loaded. Please try again later.</td></tr>';
      root.document.getElementById("required-balance").textContent = "Unavailable";
      root.document.getElementById("calculation-note").textContent = error.message;
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { DEFAULT_TARGET: DEFAULT_TARGET, formatRand: formatRand, requiredBalance: requiredBalance, validFundPayload: validFundPayload };
  }
  if (root.document) init();
})(typeof globalThis !== "undefined" ? globalThis : this);
