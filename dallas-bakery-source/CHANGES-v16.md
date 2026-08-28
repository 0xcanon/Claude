# v16 — Shopify removed, card payments on both surfaces, shipping per case

Three changes: shipping is billed per case, Shopify is gone from the tree, and
both the site and the app now take a card and show a real order confirmation.

## Shipping is charged per case

A case is a box. Three cases ship as three boxes at $12.50 each — $37.50 —
and that no longer depends on the retail box size happening to equal the case
size.

- `priceCart` sets `boxCount = caseCount` instead of dividing the loaf total by
  `unitsPerBox`. Changing the retail box size in `/admin` can no longer quietly
  re-rate a wholesale order.
- `recordOrder` uses the case count for wholesale box counts; retail still
  divides loaves into boxes.
- The buyer app's `shippingEstimate` takes cases and mirrors the server, so the
  total the buyer reviews is the total the card is charged. A test pins this
  across `unitsPerBox` of 25, 50, and 100.

## Shopify removed

Nothing in the running system refers to Shopify any more.

- Deleted `app/shopify-b2b.ts`, `SHOPIFY_SETUP.md`,
  `scripts/register-checkout-rate.mjs`, the `checkout:register` npm script, and
  the Shopify carrier-rate callback at `/api/checkout/shipping-rates`.
- Migration `0009_drop_shopify_columns.sql` drops `shopify_company_id`,
  `shopify_location_id`, `shopify_sync_status`, and `shopify_sync_error`.
  "Ordering ready" is now simply an approved application — approval and
  ordering access are the same event, so the applicant gets the decision email
  and the ordering email together instead of waiting on a sync.
- `COMMERCE_PLATFORM` is gone; there is no legacy path left to switch back to.
- The owner app's "Retry store setup" action and store-sync card are replaced
  by a plain "Private catalog ready" state.
- `/admin` readiness now reads **Buyer ordering portal** and **Card payments**
  in place of the account-sync and checkout-rate rows.
- The buyer app's `app.config.ts` no longer demands `EXPO_PUBLIC_STORE_DOMAIN`,
  `EXPO_PUBLIC_STOREFRONT_TOKEN`, `EXPO_PUBLIC_BUYER_CLIENT_ID`, or
  `EXPO_PUBLIC_BUYER_REDIRECT_URI` — four dead values that would have failed
  every signed build. It requires `EXPO_PUBLIC_API_URL` and
  `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, and rejects a key that is not `pk_`.
  The URL scheme is now `dallasbakerywholesale`.

Historical migrations and the v14/v15 changelogs still name Shopify. They are
the record of what the schema was and are left alone.

## Card payments and order confirmation

Checkout no longer hands the buyer to a Stripe-hosted page and forgets about
them. Both surfaces collect the card in place and then show the order.

- **`POST /api/buyer/payment-intent`** prices the cart server-side and returns
  a client secret scoped to that one amount, plus the priced lines and the
  locked delivery address. Clients still send SKUs and case counts only.
- **Site** — `/order` gains a Payment Element card form and a confirmation
  view. Card details are entered inside Stripe's iframe, so the number never
  touches the page's JavaScript or Dallas Bakery's servers.
- **App** — a payment review screen, then Stripe's native **PaymentSheet**,
  then an order-confirmation screen. `payments.native.ts` / `payments.web.ts`
  keep the native module out of the web bundle. PaymentSheet needs a device
  build; under `expo start --web` the app reports card payment unavailable
  rather than pretending.
- **`/api/webhooks/stripe`** now also handles `payment_intent.succeeded`. It
  re-prices the cart from `metadata.lines` through the same `priceCart` that
  set the amount, so what reaches the shipping bench is priced by the price
  authority. It records only intents tagged `source=wholesale-order`, so a
  retail Checkout Session's payment intent cannot book the same box twice, and
  the intent id doubles as the dedupe key.
- **`GET /api/buyer/order-status`** answers "is it recorded yet?". The order row
  is written by the webhook, which can land after the sheet closes, so both
  confirmation screens poll briefly. Until it arrives they say the payment is
  confirmed and the order is being recorded — never that anything failed, which
  would be untrue and would invite a second payment.
- A captured payment that cannot be re-priced is logged loudly and acknowledged
  rather than retried forever.

## Also fixed

`npm run verify` was already failing lint on v15: three
`react-hooks/set-state-in-effect` errors in `order-portal.tsx` and
`shipping-queue.tsx`. The session restore now happens during the first render,
and the two async loaders carry a documented disable. Lint is clean.

## Verification

49 unit tests pass — 37 in the site (including new coverage of Stripe form
encoding, the cart's round trip through Stripe metadata, and per-case
shipping), 9 in the buyer app, 3 in the owner app. TypeScript is clean in all
three projects, the site lints clean, and `npm run build` produces the new
`/api/buyer/payment-intent` and `/api/buyer/order-status` routes with the
Shopify callback and hosted-checkout routes gone.

**Not verified here:** no live Stripe call was made. Creating a real
PaymentIntent needs `STRIPE_SECRET_KEY`, so the card form and PaymentSheet have
not been exercised against Stripe. Run one real card order on each surface
before launch, per `LAUNCH_CHECKLIST.md`.
