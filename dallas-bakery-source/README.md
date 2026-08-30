# Dallas Bakery Wholesale — Launch Source v23

The complete Dallas Bakery wholesale system: the website buyers order from, the
owner portal that runs the bakery's day, and two native apps.

v23 adds the operational controls a wholesale business needs to run safely
every day — order holds, corrections, cancellations, partial refunds, a
permanent audit trail, a support queue, monitoring, and tested backups. See
`CHANGES-v23.md`, and `AUDIT-RESPONSE.md` for the reply to the third-party
source audit, including what is honestly still open.

## Included projects

- **`wholesale-site/`** — the wholesale website and the owner portal at
  `/admin`: applications and approvals, per-customer pricing, the product
  catalog, the shipping queue and bake sheet, UPS labels, invoices and
  statements, standing orders, the problem queue, and the database migrations.
- **`buyer-mobile-app/`** — the native iPhone/Android customer app. Apply,
  track approval, sign in, order against your own prices, pay by card or on
  account, follow an order, download invoices, report a problem, manage
  notifications, and close the account.
- **`owner-mobile-app/`** — the separate owner app: review applications,
  approve or decline, add notes, and change the live shipping settings.

Customer and owner sign-in are deliberately separate systems. No
backend-platform branding appears on any customer-facing screen.

## How the money works

These are the rules the code enforces, not preferences:

- **Every buyer sees only the price set for them.** Pricing is per customer,
  set in `/admin`, and changeable after approval. There is no marker
  suggesting anyone pays a different rate.
- **No price appears on any public page or endpoint.** Prices exist only
  behind an approved, signed-in account. An unauthenticated request cannot
  reach one.
- **Clients never send money.** The browser and the app send SKUs and case
  counts; the server prices the cart. A patched app cannot change an amount.
- **Credit can never go negative or exceed its limit.** Net 15 / Net 30 terms
  are granted per customer with a limit attached. An overdue invoice locks
  that account to card payment until it is settled.
- **A refund can never exceed what was charged**, counting anything already
  sent back — checked before Stripe is called. An invoiced order is never
  "refunded"; cancelling it releases the credit, because nothing was charged.

## Current business facts

- Shelf life: **14 days**. Certifications: **Kosher and Halal**.
- Shipping: **a flat rate per box**, owner-editable under Live order settings
  in `/admin`, and read live by the website and both apps. Boxes are costed to
  UPS from each product's own weight and dimensions.
- Stock and daily capacity are set per product, so a bread can be taken off
  sale or capped for a day without touching anything else.
- Owner email **sales@dallasbakery.com**; production domain **dallasbakery.net**.
- Notification email sends from the wholesale domain with replies routed to
  the owner mailbox.

Prices, the shipping rate, terms, and product details are all owner-editable.
Nothing above is compiled in.

## Verification

Run in each project with dependencies installed:

```
cd wholesale-site   && npm ci && npm run verify   # lint, strict TS, build, tests
cd buyer-mobile-app && npm ci && npm run typecheck && npm test
cd owner-mobile-app && npm ci && npm run typecheck && npm test
```

At the last packaging of this source: **175 wholesale-site tests passing**,
lint and strict TypeScript clean across all three projects, and 17 database
migrations applying cleanly to an empty database.

These checks verify the source. Production credentials, domain and mail DNS,
signed Apple/Google builds, and real transactions need Dallas Bakery's own
accounts and are the launch checklist's job.

## The documents, and when to read them

| Read this | When |
| --- | --- |
| `LAUNCH_CHECKLIST.md` | Before opening the site or submitting an app. Every step has a blank for evidence. |
| `SETUP_GUIDE.md` | First time setting any of it up, written for a non-developer. |
| `OPERATIONS.md` | Every day after launch: the morning round, what to do when an order goes wrong, backups, deploys. |
| `COMPLIANCE_SIGNOFF.md` | Before the first real order. Food licensing, labels, **sales tax**, terms, insurance — print and sign it. |
| `AUDIT-RESPONSE.md` | To see what a source audit found, what was fixed, and what is still open. |
| `APP_STORE_SUBMISSION.md` | Submitting to Apple or Google. |
| `wholesale-site/DEPLOYMENT.md` | Deploying the site and its database. |
| `CHANGES-v14.md` … `CHANGES-v23.md` | What changed in each release, newest last. |

> **`COMPLIANCE_SIGNOFF.md` §2 is the one that can cost real money.** This
> system does not calculate or collect sales tax. If tax is due on these
> sales, that is a change to make before launch, not after.

No production passwords, API keys, tokens, or signing credentials are included
in this archive.
