# v21 — Product spec, stock control, PO numbers, invoices, delivery dates, marketing email, push

Seven features from the launch audit's "what a wholesale site should have"
list, built in one pass and verified live against a seeded local site:
orders placed with PO numbers and requested delivery dates, sold-out and
oven-capacity limits enforced at checkout, invoices and statements rendered
and print-ready, one-click unsubscribe honoured, push devices registered and
scoped — plus 146 automated tests (134 site, 9 buyer app, 3 owner app), lint,
typecheck, a production build, and all 15 migrations applied from empty.

Everything lands in one migration,
`0014_specs_stock_po_delivery_marketing_push.sql`, so an existing store comes
fully up to date with a single `npm run db:migrate`.

## 1. Product information buyers can actually use

The bags already carry a full FDA-style label. Now the catalog carries the
same words, where a chef building an allergen matrix can read and copy them
instead of squinting at a photograph.

- **Six new fields per product**: ingredients, contains/allergen statement,
  net weight, shelf life, storage, certifications. Editable in
  /admin → Products under a **Label & specification** group, with ingredients
  given real room — a full statement with sub-ingredients in parentheses runs
  long, and truncating one would publish an incomplete allergen declaration.
- **Seeded with the real copy** for all four breads, read off the product
  photographs on dallasbakery.com: the full bromated-flour ingredient
  statement, "Wheat, Sesame" (or "Wheat. Made in a bakery that also handles
  sesame." for the no-sesame loaves), net weights, 14-day shelf life, storage,
  and Kosher (K Pareve) / Halal / Vegan.
- **Shown everywhere a buyer looks**: a "Contains:" line on every catalog
  card, a collapsible **Ingredients & product spec** panel on the website,
  and a full spec block on the app's product screen — each ending with
  "this matches the printed bag word for word."

## 2. Out-of-stock and oven capacity

- **Sold out today** is one click in /admin → Products (**Mark sold out** /
  **Back in stock**). The bread stays in the catalog, visibly unavailable,
  and comes back with one more click tomorrow morning. Different from hiding
  a product, which retires it.
- **Cases you can bake in a day** stops the ovens being oversold. The catalog
  counts today's committed cases (from non-refunded wholesale orders, on the
  bakery's Central day boundary) and refuses the case that would cross the
  line — "Only 3 cases of Barbari are left today", then "fully booked for
  today. Try again tomorrow, or call us."
- **Most cases in one order** caps a single order's take of one bread.
- **0 means no limit** on both numbers, and that is the default, so a bakery
  that never wants this simply never sets it.
- Enforced in the pure pricing core before any money is computed, so the same
  rule holds at checkout, at Stripe intake, and on standing weekly orders.
  The admin card shows "12 of 40 cases ordered today" per bread.

## 3. PO numbers

- An optional **PO number** field at checkout on both the website and the app,
  validated server-side before a card is charged (letters, numbers, spaces,
  and `- . / #`, up to 40 characters) — a rejected PO after payment would mean
  refunding a good order.
- Kept exactly as the buyer typed it, minus stray whitespace: a PO number is
  their identifier, not ours, and it has to match their paperwork.
- Carried through both order paths (Stripe metadata for card orders, directly
  for account orders), stored on the order, printed on the invoice, shown on
  the shipping queue row, and exported in the orders CSV.

## 4. Downloadable invoices and statements

- **Every order has an invoice** — invoice number (DB-1042), date, PO
  reference, terms and due date, bill-to and ship-to, line items with per-case
  and extended amounts, subtotal, shipping, and a balance due or "Paid in
  full". Rendered as a self-contained printable page: the buyer opens it and
  saves it as a PDF, which is what they were going to do with a PDF anyway,
  and nothing can fail at runtime the way a binary generator can.
- **Account statements** age every open invoice into the four buckets an
  accounts-payable department recognises (current, 1–30, 31–60, 61+), total
  the balance owed, and show the account's terms and remaining limit.
- **Where they live**: an "Invoices & statements" table in the website portal
  and an invoices card on the app's account screen, both with a
  paid/due/overdue status per row; the shipping queue's Money panel has an
  **Open invoice** link for the owner.
- **How the links work**: a browser tab cannot send the app's Authorization
  header, so a signed-in client trades its session for a twenty-minute signed
  URL scoped to one business and one document. Following another business's
  link returns "That invoice could not be found" — verified live. Documents
  are served `no-store`, `noindex`, same-origin-framed, and never cached.

## 5. Delivery-date selection

- A **Delivery day** picker at checkout on both surfaces, offering only days
  the bread can physically arrive: the list is computed from today's noon
  Central cutoff plus UPS Ground business-day transit, starting at the
  earliest realistic date and running twenty business days out.
- The wording everywhere says **requested** — a chosen date is a request, not
  a courier guarantee. Leaving it blank means "as soon as it arrives", and
  that stays the default.
- Validated server-side on both order paths: a weekend, a date before the
  earliest arrival, or a date past the horizon is refused with a plain
  sentence ("The earliest we can get this to you is Tue, Sep 1").
- A date chosen before the cutoff passed is dropped rather than sent to a
  server that would reject it. The bench sees "Wants 2026-09-03" on the
  shipping-queue row, and the date prints on the invoice.

## 6. Marketing email

- **A real opt-in list**, separate from transactional mail. Buyers join via an
  unchecked box on the wholesale application ("Email me when Dallas Bakery
  adds a bread or changes wholesale pricing"), or the owner adds someone who
  asked in person. Nobody is ever added silently.
- **Sending** happens in one place — /admin → Email list & notifications —
  with a **Send test to me** button that sends the identical message to the
  owner first, and a send button that names how many businesses will receive
  it and asks once more. A send cannot be recalled, so the panel is built to
  slow it down by exactly one step.
- **Every message is legal to send**: the CAN-SPAM footer (postal address,
  working one-click unsubscribe, phone and email) is generated, never typed.
  A campaign with no subject, no body, or an all-capitals subject is refused
  before it reaches anyone.
- **Unsubscribing takes effect immediately** — no sign-in, no "are you sure",
  no preference centre — and says the same thing whether the token was known
  or already spent, so a forwarded link cannot be used to test whether an
  address is on the list. Both GET and RFC 8058 POST are handled.
- Order confirmations, tracking, and invoices are unaffected, and the
  unsubscribe page says so plainly.

## 7. Push notifications

- **Buyers** are told when their order is received, when it ships (with the
  UPS tracking number), three days before an invoice is due, on the day, and
  weekly once it is past due — at which point their account is locked to card
  and they need to know why.
- **No buyer notification ever states an amount.** Prices here are set per
  customer and a lock screen is read by whoever is holding the phone. The
  owner's alert does carry the total: it is the owner's phone.
- **The owner** gets a new-order alert with the business, case count, amount,
  and whether it was on account.
- **Quiet by design**: at most one push per invoice per day, and nothing on
  the days in between — an app that nags gets its notifications switched off,
  and then the important one never arrives.
- **Permission is asked after sign-in**, not at first launch, so the prompt
  arrives when it is obvious what it is for. Every failure path is silent: a
  buyer who declines keeps a fully working app and still gets email.
- Delivery goes through Expo's push service (Expo → APNs/FCM). Tokens are
  stored per device and scoped to the business that registered them; a buyer
  cannot register as the owner (verified: 401), a malformed token is refused,
  signing out unregisters the device, and tokens Expo reports as dead are
  deleted so the table does not fill with uninstalled apps.
- Invoice reminders run from the existing daily cron, alongside the standing
  orders, each contained so a failure in one still lets the other run.

## Setup

Two optional environment values, both of which the system degrades gracefully
without:

| Value | Where | What it does |
| --- | --- | --- |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | EAS environment variables (buyer app) | Lets a signed build mint push tokens. `eas init` writes it for you. Without it, push registration returns nothing and buyers get email only. |
| `EXPO_ACCESS_TOKEN` | Worker secret | Requires a signed sender for push. Recommended once the apps are in the stores; unset works for standard Expo builds. |

Marketing email reuses the existing `MAIL_*` settings. Nothing else changes.

## Files

New: `app/availability.ts`, `app/delivery-dates.ts`, `app/invoice-render.ts`,
`app/invoices.ts`, `app/invoice-reminders.ts`, `app/marketing-copy.ts`,
`app/marketing-list.ts`, `app/push-messages.ts`, `app/push-notifications.ts`,
`app/admin/marketing-panel.tsx`, four API routes
(`/api/buyer/documents`, `/api/documents`, `/api/admin/documents`,
`/api/admin/marketing`, `/api/push/register`,
`/api/marketing/unsubscribe`), three test files, and in the apps
`src/lib/push.ts`, `src/components/OrderPaperwork.tsx`,
`src/components/InvoicesCard.tsx`.

The pure modules (`catalog-pricing`, `credit-terms`, `delivery-dates`,
`invoice-render`, `marketing-copy`, `push-messages`, `order-rules`) import no
database, so every rule above is unit-testable and the same arithmetic runs on
the website, both apps, and order intake.
