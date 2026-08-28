# v17 — premium storefront, order tracking, and a branded checkout

Confirmed pricing: **$2.50 a loaf, sesame $1.80** — so a 25-loaf case is
**$62.50**, sesame **$45.00**. The server catalog already held these numbers;
nothing about pricing changed. Only the screenshot fixtures had been showing a
placeholder $50.

## Order tracking, end to end

`app/order-status.ts` is now the single vocabulary for where an order is, used
by the app, the website, and the admin queue so the three cannot drift.

- Three buyer-facing stages — **Baking → Packed → Shipped**. The database's
  internal `labeled` state (a label has been bought) is shown as "Packed",
  because "labeled" only means something on the shipping bench.
- **Tracking is gated on `trackable`**, not on a tracking number existing. A
  number appears the moment a label is bought, but UPS has nothing to show
  until the parcel is scanned — so the button only appears once the order is
  actually shipped, and until then the buyer is told when to expect it.
- `/api/buyer/orders` now returns stage, tracking, case/box/loaf counts, line
  items, totals, and the delivery address.

**App** — "My orders" is rebuilt: a status pill, a three-step tracker, and a
**TRACK SHIPMENT · UPS** button per order. Tapping an order opens a new
`OrderDetailScreen` with the full tracker, line items, totals, delivery
address, and a one-tap **order these cases again**.

**Website** — "My orders" on `/order` gains the same tracker, the same tracking
link, and a per-order breakdown of what was in it.

## Admin panel

- **Fixed a real bug:** the shipping queue was rendered *inside* `.admin-toolbar`,
  a dark flex bar built for the filter buttons. The whole orders table was dark
  text on a dark background, squashed into a row. It is now its own section.
- **Day summary** above the queue: orders, cases, boxes to ship, order value,
  and how many are still to ship.
- **"What was ordered"** expands any row into what to pack, where it ships, and
  the money — so a box can be packed without opening Stripe.
- Statuses read in the same words the buyer sees; tracking numbers link to UPS
  and show when tracking was emailed.
- Shipping settings now describe the per-case rule rather than "per box of 25
  units".

## Branded checkout

The card step is Dallas Bakery's, not a stock payment form.

- **Website** — the Payment Element is themed with the bakery's palette, its
  serif, square corners, and uppercase labels; the page around it carries the
  brand, the order summary, and the locked delivery address. The button reads
  **Pay Dallas Bakery $225.00**.
- **App** — the PaymentSheet is themed to match, down to the primary button
  label. The screen before it leads with "You are paying Dallas Bakery
  directly."
- Both keep one discreet, accurate line that the card is encrypted and never
  reaches Dallas Bakery's servers. That is what keeps the business out of PCI
  scope, so it is worth saying plainly.

## Premium storefront

- `/order` is a two-column shop with a sticky order summary: product cards with
  photography, a Kosher · Halal tag, per-case price with the per-loaf
  breakdown, and a live line total as cases are added.
- The real product photo now ships at `public/images/case.jpg` — the catalog
  previously pointed at four image paths that did not exist and rendered as
  broken images. All four SKUs use it; drop per-variant photos in and point
  `imageUrl` at them.
- Shipping copy across the homepage, `/order`, and the app now describes the
  per-case rule.

## Fixed along the way

A hydration mismatch on `/order`: v16 read the stored session in a `useState`
initialiser, which the server cannot do, so React discarded and rebuilt the
tree on every load. The session is restored in an effect again, with the lint
rule scoped narrowly and the reason written down.

## Verification

53 unit tests pass (41 site, 9 buyer app, 3 owner app), TypeScript clean in all
three projects, the site lints and builds. The website and admin screenshots
were taken against the real app running on a seeded local database — the
prices, totals, and tracking states in them are computed by the real code.

**Not verified:** no live Stripe call. Creating a PaymentIntent needs
`STRIPE_SECRET_KEY`, so the card form itself has not been exercised against
Stripe and there is no screenshot of it. Run one real card order on each
surface before launch.
