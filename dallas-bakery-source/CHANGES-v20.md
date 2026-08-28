# v20 — Credit accounts (order without a card) and exclusive per-customer pricing

Everything in this round was verified live against a seeded local site:
account orders placed and recorded, over-limit orders refused with the right
amount, invoices marked paid, account orders cancelled, credit limits and
exclusive prices set and cleared from /admin — plus 81 automated tests
(69 site, 9 buyer app, 3 owner app), lint, typecheck, and a production build.

## Credit terms (order on account)

- **Granting credit.** Approving an application now asks whether to give the
  buyer a credit limit (dollars; 0 keeps them card-only). Every approved
  card also carries a **Credit terms** editor showing
  limit / outstanding / available, with a save box — so the limit can be
  granted, raised, lowered, or revoked at any time.
  Database: `credit_limit_cents` on `wholesale_applications`
  (migration `0012`).
- **Ordering without a card.** Buyers with credit check out on account by
  default: **"Place order on account"** is the primary button on the website
  portal and in the app's payment screen (with how much credit is left), and
  they are never asked for a card — **"Pay by card instead"** sits underneath
  as the optional path, becoming required only when an order is over the
  available credit. The endpoint (`POST /api/buyer/order-on-account`) prices the same
  cart server-side (exclusive prices included), checks it against available
  credit, and records the order immediately with `payment_terms='account'`
  — no Stripe object exists for it. The response carries the recorded
  order, so confirmation screens show the order number instantly with no
  webhook polling. An order over the available credit is refused with the
  exact amount left; the refusal is a 400, never a session-expiry code.
- **Outstanding balance.** Unpaid account orders (not refunded, invoice not
  marked paid) sum into the buyer's outstanding balance; available credit is
  limit minus outstanding, floored at zero. Pure arithmetic lives in
  `app/credit-terms.ts` with its own test file.
- **Owner's workflow.** Account orders appear in the shipping queue tagged
  **ON ACCOUNT** (later **Invoice paid**); the expanded Money panel says
  **To invoice** instead of Charged and offers **Mark invoice paid**
  (releases the credit) and **Cancel order** (releases the credit without
  touching Stripe — nothing was charged). The owner alert email is flagged
  ON ACCOUNT and explains the invoice flow; the buyer confirmation says
  "we'll invoice you — nothing was charged to a card."
- **Buyer history.** "My orders" on both surfaces badges account orders
  (On account / Invoice paid), and the credit position banner on the portal
  shows available / limit / open invoices.

## Exclusive per-customer pricing

- **Setting prices.** Every approved application card has an **Exclusive
  pricing** section listing the live products with their list price; type a
  per-loaf price and Set to give that business its own price, or
  "Back to list price" to remove it. Stored in the new `customer_prices`
  table (one row per business + product), managed through
  `POST /api/admin/customer-prices`.
- **Where it applies.** Overrides are resolved server-side everywhere a cart
  is priced: the buyer's catalog (their price is simply shown as the price —
  the list price never reaches a buyer's browser or phone, and nothing in
  the catalog signals that other businesses pay differently), the payment
  intent, webhook intake re-pricing, standing weekly orders, and
  order-on-account. The pure pricing core
  (`priceCartFromProducts`) takes an optional overrides map, so one code
  path prices every buyer correctly; new tests pin the behaviour (override
  applies to its SKU only, invalid values fall back to list, shipping is
  untouched).

## No public prices at all

- Nothing outside a signed-in account shows a dollar figure anywhere. The
  public home page, the /order landing, and the /apply page describe how
  ordering and per-case shipping work without quoting a rate; the public
  settings endpoint (`/api/wholesale-settings`) now carries pack facts and
  ordering rules only, never a price. The app's pre-sign-in welcome screen
  says "One case, one box" instead of a rate, and the app never displays a
  price the server did not send for that signed-in account. Verified live:
  the rendered public pages contain zero dollar figures.

## Also in this round

- The four merge-round fixes are folded in: the mobile card layout for the
  shipping queue (`data-label` cells + the 720px CSS block), the https://
  guard on `EXPO_PUBLIC_API_URL` in signed builds, `expo-crypto` removed
  from the buyer app (lockfile regenerated), and the cart's Texas tax note.
- Migration `0012_credit_terms_and_customer_prices.sql`; all 13 migrations
  verified to apply cleanly in order.

## Numbers

- Tests: 69 site + 9 buyer app + 3 owner app, all green.
- No client ever sends money amounts; credit checks and exclusive prices are
  entirely server-side, so a patched app can neither change a price nor
  exceed its credit line.
