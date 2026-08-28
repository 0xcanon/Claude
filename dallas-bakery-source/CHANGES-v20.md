# v20 — Credit accounts (order without a card) and exclusive per-customer pricing

Everything in this round was verified live against a seeded local site:
account orders placed and recorded, over-limit orders refused with the right
amount, invoices marked paid, account orders cancelled, credit limits and
exclusive prices set and cleared from /admin — plus 89 automated tests
(77 site, 9 buyer app, 3 owner app), lint, typecheck, and a production build.

## Net terms (order on account)

- **Net 15 / Net 30 is the account.** The owner puts a chosen business on
  net terms and sets its **net limit** — the most it can owe at once; the
  limit is attached to the terms, so card-only businesses have neither.
  Approval asks terms first (30 / 15 / 0 for card-only), then the limit;
  both are settable on pending applications (live at approval) and
  editable any time in the card's Net terms box (Card only / Net 15 /
  Net 30 + net limit). Stored coherently: terms always carry a limit and
  a limit always carries terms.
  Database: `credit_limit_cents` + `credit_terms_days` on
  `wholesale_applications`, `invoice_due_at` on `orders`
  (migrations `0012`, `0013`).
- **Past due locks the account.** The credit state now carries the overdue
  slice of the balance (unpaid past its due date). While it is above zero,
  on-account ordering is refused server-side and both checkouts switch to
  card with a past-due notice ("pay by card until it's settled"); the
  portal banner turns red, and the admin card shows "Past due $X — locked
  to card". Marking the overdue invoices paid in the shipping queue
  reopens the account instantly. Verified live end to end.
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
- Migrations `0012_credit_terms_and_customer_prices.sql` and `0013_net_payment_terms.sql`; all 14 migrations
  verified to apply cleanly in order.

## Numbers

- Tests: 77 site + 9 buyer app + 3 owner app, all green.
- No client ever sends money amounts; credit checks and exclusive prices are
  entirely server-side, so a patched app can neither change a price nor
  exceed its credit line.
