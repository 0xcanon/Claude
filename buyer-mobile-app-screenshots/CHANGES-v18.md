# v18 — operations and repeat business

Everything in this release exists to make launch week runnable by one person
and to make the second order easier than the first.

## The bakery hears about every order

- **Owner alert email** the moment an order is recorded — items, boxes, money,
  and whether it ships today. With a noon Central cutoff, an order nobody
  notices ships a day late; this closes that gap for both stores.
- **Branded buyer confirmation** for wholesale orders — what was ordered, the
  total charged, and what happens next, sent alongside Stripe's receipt.
- Both send from the webhook only when the order row is actually created, so a
  Stripe retry can never re-send them, and a mail outage can never fail the
  webhook.

## Admin panel

- **Bake sheet** — the per-bread rollup of everything unshipped in view
  ("3 cases Barbari · 75 loaves"), with a print view that prints only the
  sheet. This is what the person at the oven reads each morning.
- **Refunds** — a Refund button on the expanded order, full refund through
  Stripe, idempotent on the payment-intent id so a double-click cannot refund
  twice. One order at a time by design. Shipped orders refuse the button and
  point to Stripe, since the boxes are already gone. Refunded orders leave the
  shipping queue and show as "Refunded" to the buyer everywhere.
- **CSV export** of the current scope — the spreadsheet the accountant asks
  for. Fields are properly quoted; money is in dollars.
- **Weekly summary** — last 8 weeks of orders, loaves, and revenue (refunds
  excluded), so growth is visible without a spreadsheet.
- **Delivery locations** — the owner can approve additional addresses for a
  business inside its application card. Adding an address IS the screening
  step; contiguous-US only, same as applications. Addresses deactivate rather
  than delete, so past orders keep their record.

## Saved cards

One Stripe Customer per approved business, created lazily at first payment and
stored on the application row. Cards save with `off_session` usage:

- **Web** — the Payment Element gets a customer session, so returning buyers
  see their saved card and a save-for-next-time box.
- **App** — the PaymentSheet gets the customer and an ephemeral key and shows
  the same saved cards.
- Every piece degrades: if the customer or session call fails, checkout still
  takes a one-off card payment.

## Multi-location delivery

`/api/buyer/catalog` now returns every approved address — the screened primary
plus owner-approved extras — and checkout accepts a `locationId` resolved
strictly against that list. An unknown id falls back to the primary, never to
an error and never to an unapproved address, so the redirect-to-a-house
protection is unchanged. The website shows a delivery picker when a business
has more than one address; the app's existing location selector now carries
real locations. The UPS label carries the location's name, so a multi-store
business's box says which store it is for.

## Standing weekly orders

"Every Tuesday, these cases." Set from the order page in one click once a cart
is built; charged off-session to the saved card by a daily cron (13:00 UTC,
`triggers.crons` in wrangler.deploy.jsonc, `scheduled` handler in the worker).

- Runs re-price from the live catalog every time — a price change charges the
  new price, never a stale one.
- Idempotency is layered: a per-day run stamp plus a per-business-per-day
  Stripe idempotency key, so even a crashed and retried run cannot charge
  twice.
- The charge carries the same metadata as a checkout payment, so the existing
  webhook records it, the owner is alerted, and the buyer gets the same
  confirmation — one intake path, not two.
- A failed charge emails the buyer that morning with what to do, and one
  declined card never stops the next business's bread.
- Weekday logic is evaluated in Central time and unit-tested across the UTC
  midnight boundary.

## App–website parity

The app and the website now offer the same wholesale experience, feature for
feature:

- **Standing orders in the app** — the cart gains the same standing-order card
  as the website (weekday chips, "Make it weekly", pause), and the account
  screen shows the active order ("Every Tuesday · 3 cases · $225.00") with a
  pause action. Same API, same server-side pricing.
- **Cutoff banner in the app** — the catalog and cart now show the one line
  every wholesale buyer plans around ("Order in the next 2 hours and it bakes
  and ships today"), rendered identically in both places so the answer never
  changes between adding cases and paying. The order confirmation reflects it
  too, instead of a hardcoded blank.
- **Reorder on the website** — every past order gets "Order these cases
  again", refilling the cart with whatever is still in the catalog, matching
  the app's order-detail reorder.
- **Refunded orders on the website** — the pill, the plain statement instead
  of a progress tracker, and no tracking link, matching the app.

## Parcel weight confirmed: 27 lb

The packed-box weight UPS bills on is no longer a "weigh me" placeholder: the
owner confirmed a packed box weighs **27 lb**, which is exactly the stored
432 oz, and every label sends UPS 27 lb. The weight is now also editable in
`/admin` under Live order settings (entered in pounds, 1–150 lb, validated
server-side), so a future packing change never needs a deploy. Old admin
clients that don't send the field can't reset it.

## Deliberately not in this release

Push notifications. They need APNs/FCM credentials and a store build to test
against — batch them with the first app update instead of holding launch.

## Verification

62 unit tests pass (50 site, 9 buyer app, 3 owner app), app–website parity
was re-verified screen by screen; TypeScript and lint
clean in all three projects; the site builds with the new
`/api/buyer/standing-order` and `/api/admin/buyer-locations` routes. Website
and admin screenshots were captured from the real site on a seeded database —
the bake sheet, weekly revenue, location picker, and standing-order card in
them are computed by the real code.

**Not verified:** anything requiring a live Stripe key — saved-card display,
off-session charges, refunds. Migration 0010 must run before deploy
(`npm run db:migrate`). Test a standing order end to end with a real card
before relying on it.
