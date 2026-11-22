# Investment funds

A lightweight static comparison page served by the `investment-funds` Cloudflare Worker. It starts with one product: Absa's 45-day Personal Notice account.

## Data and calculation

The page distinguishes the notice deposit account from a unit trust/investment fund. The minimum opening amount and current interest rate are left unverified unless configured from a current Absa source; they are not guessed. The page links to Absa to verify the current account terms.

To publish verified figures, set these non-secret Wrangler variables in `wrangler.toml` or the Cloudflare dashboard:

- `ABSA_MINIMUM_ZAR`: verified minimum opening amount in rand.
- `ABSA_ANNUAL_RATE_PERCENT`: verified gross annual rate, as a percentage (for example, `7.5` for 7.5%).
- `ABSA_RATE_AS_OF`: date the rate was checked, in `YYYY-MM-DD` format.

The browser can also accept a manually entered annual rate; that rate and the annual target are saved in that browser only. The required balance is `annual income goal / (annual interest rate / 100)`. It estimates gross simple interest for a year at a constant rate and excludes tax, fees, compounding, and rate tiers. It is not a forecast or investment advice.

## Run and deploy

From this directory, run `npx wrangler dev` for local preview and `npx wrangler deploy` to deploy the Worker and static assets. The configured Worker name is `investment-funds`. No other workspace Worker is modified.

## Tests

Run `node --test tests/*.test.mjs`.
