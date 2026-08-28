# v15 — order rules, Stripe order intake, UPS shipping labels

Two changes drove this release: the wholesale order rules the owner set, and
the decision to run **both stores on Stripe and drop Shopify entirely**.

## Order rules (one definition, used everywhere)

`wholesale-site/app/order-rules.ts` is now the single source for:

- **Cutoff 12:00 PM Central.** Before the cutoff on a business day, the order
  bakes and ships that day; after it, the next business day. Evaluated in
  Central time, not UTC, so it doesn't drift by five hours on a Worker.
- **Minimum 1 case.**
- **Contiguous US only** — Alaska, Hawaii, and territories are refused at the
  application endpoint with a message pointing to sales@dallasbakery.com.
- 1–4 business day delivery, UPS Ground, tracking emailed on shipment,
  14-day shelf life, 7-day window for late/lost/damaged claims. These mirror
  the retail policy at dallasbakery.com.

They appear on the homepage FAQ, the `/order` page, inside the application
form, in the approval and ordering-ready emails, and in the public settings
API (so the buyer app shows the same numbers). The FAQ line that claimed
nationwide shipping was corrected.

## Orders and shipping labels

- **New `orders` table** (migration `0007_orders_and_parcel.sql`) — one row per
  paid Stripe Checkout session, retail and wholesale in one queue.
- **`/api/webhooks/stripe`** — signature-verified with WebCrypto against
  `STRIPE_WEBHOOK_SECRET`. Idempotent on the session id, so Stripe's retries
  can't duplicate a box. `metadata.channel` splits retail from wholesale and
  `metadata.loafCount` drives the box count.
- **UPS labels** (`app/ups-shipping.ts`) — OAuth client-credentials against
  Dallas Bakery's own UPS account, Ship API, **4x6 ZPL** for the thermal
  printer. Tokens cached until just before expiry; a 401 clears the cache.
- **Shipping queue in `/admin`** — filter by needs-shipping / today / all,
  tick orders, *Create labels*, *Label everything from today*, then *Print* to
  download one merged `.zpl` containing every selected label. A failed label
  is recorded on its own row and never aborts the batch, and an order that
  already has a label is never charged for a second one.
- **Mark shipped + email tracking** — closes the loop the site already
  promised. Mail failure can't un-ship an order.
- **Parcel settings** — box weight and dimensions live in the shipping
  settings table. Carton is set to the real **24 x 16 x 6 in**; the weight is
  still a placeholder (25 lb). **Weigh a packed box and set the real weight
  before the first live label — UPS bills on it.**
- Two new readiness rows in `/admin`: order intake and UPS labels (now 8).

## Shopify removal

- `COMMERCE_PLATFORM` defaults to `stripe`: approvals complete immediately
  instead of waiting on a B2B sync that will never run. Set it to `shopify`
  only to revive the legacy path.
- The Shopify B2B module, carrier-rate callback, and `checkout:register`
  script are still in the tree but inert. They come out in the next pass,
  along with the buyer app's Shopify sign-in and catalog — that app's
  ordering stack has to be rebuilt on Stripe (phase B).

## Wholesale ordering on Stripe (replaces Shopify)

- **Buyer sign-in without Shopify** (`app/buyer-auth.ts`) — email plus a
  six-digit code checked against approved applications. Codes are stored
  hashed, expire in 15 minutes, are single-use, cap at 5 attempts, and have a
  45-second resend cooldown. The session that follows is an HMAC-signed token,
  so no session table exists to steal. The request endpoint answers
  identically for unknown addresses so it cannot be used to discover who has
  an account.
- **Case catalog** (`app/wholesale-catalog.ts`) — Barbari, Natural, and Whole
  Wheat at $62.50 per 25-loaf case ($2.50/loaf); Sesame at $45.00 ($1.80/loaf).
  This module is the price authority: clients send SKUs and case counts only.
- **Checkout** (`/api/buyer/checkout`) — prices the cart server-side, enforces
  the 1-case minimum, adds $12.50 per box as a separate shipping line, and
  opens a Stripe Checkout Session tagged `channel=wholesale`. **No shipping
  address is collected at checkout**: delivery is locked to the storefront
  verified during screening, which travels as session metadata. That is what
  stops an approved account from redirecting cases to a house.
- **Order history** (`/api/buyer/orders`) — the buyer's own orders with UPS
  tracking links, from the same table the shipping queue prints from.
- **Web portal** — `/order` is now a working store: sign in, pick cases, see
  the live cutoff notice, check out, review past orders.
- **Mobile app rewired** — `buyer-auth.ts` and `storefront.ts` now target this
  API instead of Shopify's Customer Account and Storefront APIs. New
  `SignInScreen` handles email then code; the catalog, cart, orders, and
  locations screens kept their existing prop shapes, so the API returns those
  shapes rather than the screens being rewritten. No browser round trip and no
  password anywhere in the app.

## Verification

36 unit tests pass: 30 in the site (order rules, catalog pricing, UPS labels,
tracking email, plus the existing suites) and 3 in each app. All 9 migrations
apply to a fresh database, and the `orders` table's 29 columns match
`db/schema.ts` exactly. TypeScript was diffed against the v14 baseline in all
three projects: no new errors. Dependencies still could not be installed
offline, so run `npm ci && npm run verify` before deploying.
