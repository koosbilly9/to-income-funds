# Investment funds

A lightweight static comparison page served by the `investment-funds` Cloudflare Worker. It starts with Absa's 45-day Personal Notice account and Strategy Inc.'s STRC preferred share.

## Data and calculation

The page distinguishes the notice deposit account from a unit trust/investment fund. Through `/api/funds`, the Worker downloads `https://www.absa.co.za/rates-and-fees/?scrolltome=notice-select` and caches the parsed result for one week (`604800` seconds). It extracts the `notice-select` section's Standard Rate `100/0` (100% 45-day notice) rate for the opening substantive balance tier (`R1,000+`), minimum deposit (`R1,000`), and review date. If the upstream page cannot be fetched or parsed and no override variables are set, the figures remain unverified rather than guessed.

To override the scraped figures manually, set these non-secret Wrangler variables in `wrangler.toml` or the Cloudflare dashboard:

- `ABSA_MINIMUM_ZAR`: verified minimum opening amount in rand.
- `ABSA_ANNUAL_RATE_PERCENT`: verified gross annual rate, as a percentage (for example, `7.35` for 7.35%).
- `ABSA_RATE_AS_OF`: date the rate was checked, in `YYYY-MM-DD` format.

The Absa balance estimate is `annual income goal / (annual interest rate / 100)`. It estimates gross simple interest for a year at the configured constant rate and excludes tax, fees, compounding, and rate tiers.

The STRC frame loads the share price, trailing 12-month dividend events, and USD/ZAR conversion from Yahoo Finance through `/api/strc`. Dividend yield is trailing dividends per share divided by the latest share price. Target shares are rounded up from the ZAR income goal converted to USD and divided by trailing dividends per share. This is a historical estimate, not a forward payout promise; distributions and exchange rates can change. The Worker caches the quote response for five minutes.

The annual income goal is editable and saved in the current browser only.

## Run and deploy

GitHub Pages is configured to publish the `main` branch root. Keep `index.html` and `app.js` in that root. GitHub Pages requests the data API from `https://investment-funds.koosbilly9.workers.dev`; the Worker permits public read access for this static site.

From this directory, run `bun x wrangler dev` for local preview and `bun x wrangler deploy` to deploy the Worker and root static assets. `.assetsignore` excludes repository files from Worker asset uploads. The configured Worker name is `investment-funds`.

## Tests

Run `bun test tests/*.test.mjs`.
