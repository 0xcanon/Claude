# Response to the v21 source audit

The audit's headline is right, and it is the useful sentence in the whole
document:

> *You are not missing a basic storefront. You are missing the operational
> controls that make wholesale safe to run every day.*

I checked every finding against the code before building anything. Most of
them hold. This page says which ones were closed in v23, which were already
closed in v22 and the auditor could not have seen, which are honestly still
open, and the one claim that is factually wrong about the delivered artifact.

Nothing below is marked done unless it is in the code and was exercised
against a running server.

---

## P0 — the audit's "close before public launch" list

| # | Finding | Status |
| --- | --- | --- |
| 1 | Production setup is not complete | **Open — and it always will be, until you do it.** No code can close this. What v23 adds is the evidence trail the auditor asked for: `LAUNCH_CHECKLIST.md` section 5 now has a blank beside every operational item to write the date, the order number, and the person's name. |
| 2 | No cancellation, refund, void, or dispute workflow | **Closed.** |
| 3 | No order correction or exception workflow | **Closed.** |
| 4 | Webhook idempotency and payment reconciliation untested | **Closed in code and unit tests; one live item stays on the checklist.** |
| 5 | No backup/restore or disaster-recovery procedure | **Closed.** |
| 6 | No production monitoring or alerting | **Closed.** |
| 7 | Food, tax, and commercial policy sign-off | **Open by nature — now has a form.** `COMPLIANCE_SIGNOFF.md` is the sheet to sign. |

### 2. Cancellation, refund, dispute

The audit's acceptance criterion was: *owner can cancel before fulfilment,
issue full/partial Stripe refunds, record reason, notify buyer, preserve an
immutable financial history.* All five:

- Orders now move through `paid → held → labeled → shipped → delivered`, with
  `cancelled` and `refunded` as endings. The transitions live in one place
  (`app/order-status.ts`) so every screen gives the same answer to "can this
  still be cancelled".
- **Partial refunds** work. The amount is checked against what is left on the
  order *before* Stripe is called, so an order can never be refunded for more
  than it was charged. Stripe's returned amount is what gets recorded, not
  what was asked for.
- The idempotency key includes the amount, so pressing Refund twice on the
  same amount cannot refund twice, while a later, different partial refund on
  the same order still goes through.
- **An invoiced order is never "refunded".** Nothing was charged; cancelling
  it releases the credit. The system refuses the refund and says so.
- Every move writes an `order_events` row with the actor (`owner:email`,
  `buyer:email`, `system`, `stripe`), a summary, and a detail. Rows are only
  ever inserted. That table is the dispute evidence.
- **The trail starts at the order, not at the first problem.** Placing an
  order, buying a label, a label UPS refused, handing the boxes over, and
  settling an invoice all write a line too — so an order that went perfectly
  still has a history, and the gap between "paid" and "shipped" has an
  explanation in it. Fulfilment actions are signed with the admin who pressed
  them, the same as the lifecycle ones.
- The old full-refund-only endpoint, which moved money without writing
  anything down, now returns 410 and points at the audited path. An
  unaudited way to move money is not something to leave lying around.
- Cancelling a card order refunds it in full on the way out, and the buyer
  sees the reason in their own order history.

### 3. Corrections and holds

- **Put on hold** with a reason the buyer reads, and **take off hold**.
- **Fix the details** — address, phone, PO number, requested delivery day —
  before a label is bought, with the before-and-after written into the
  history. A corrected address is re-checked against the deliverable states.
- Deliberately *not* editable: what was ordered and what it cost. The audit
  suggested "re-pricing rules and payment-difference handling"; changing the
  money after the fact is a refund-and-reorder, and conflating the two is how
  books stop balancing. The screen says so.

### 4. Webhook reconciliation

The decisions now live in `app/webhook-intake.ts` with no database import, so
each one is a unit test rather than a hope. Eighteen tests in
`tests/webhook-intake.test.ts` cover exactly the four cases the audit named:

- **Duplicate delivery** — the same event twice yields the same dedupe key,
  and the unique index makes the second write a no-op.
- **Delayed delivery** — a captured webhook replayed an hour later is refused
  on its timestamp, separately from the HMAC, which still matches.
- **Late after settlement** — a retry arriving for an order already cancelled
  or refunded is logged as `webhook.late_after_settlement` rather than
  silently swallowed.
- **Amount reconciliation** — what Stripe captured always wins on the order,
  because the invoice has to match the bank; a disagreement with today's
  price emails the owner instead of writing a console line nobody reads.

The one thing tests cannot do is prove it against live Stripe. That is on the
checklist as a real duplicate-delivery replay from the Stripe dashboard.

### 5. Backups

`npm run db:backup` exports the live database, then **restores it into a
throwaway local database and compares the row counts table by table**. If they
disagree, it fails and tells you not to rely on that file. An export nobody
has restored is not a backup, which is why the restore is part of the same
command rather than a paragraph in a document.

`npm run db:backup:rehearse` does the whole thing against the local database
so it can be practised without touching anything live. That rehearsal was run
and passes.

Retention, off-machine storage, and the recovery steps are in
`OPERATIONS.md`. RPO/RTO in plain words: a weekly backup means up to a week of
orders would have to be re-entered from Stripe, which holds every payment with
its amount and email. If that is too much, take one daily — the command is the
same.

### 6. Monitoring

- **`/api/health`** runs a real query (`SELECT COUNT(*) FROM products`, not
  `SELECT 1`, so a missing migration surfaces) and reports whether Stripe,
  UPS, mail, and owner alerts are configured. Only the database can make it
  503; a missing key is configuration, not an outage.
- **Structured JSON logs** with a redactor that strips anything matching
  `token|code|secret|password|authorization|card|cvc|pan` before it is
  written.
- **Owner alerts by email** for the five silent failures the audit named:
  a paid order that could not be recorded, a captured amount that does not
  match today's price, a partial standing-order run, a UPS label failure, and
  a failed invoice-reminder run. Throttled to one an hour per kind, so a
  broken UPS connection does not send four hundred emails. Each says what to
  do about it.

---

## P1 — closed in v23

### 1. Order lifecycle and customer service — **closed**

The audit asked for a buyer-facing "Need help?" on every order with structured
reasons, an owner queue, internal notes, resolution status, and response
history. All of it is in:

- **Buyer**, on the website and in the app: seven structured reasons
  (damaged, short, wrong item, late, billing, change, other), each with a
  prompt asking for the detail that decides what happens next. Plus **ask us
  to cancel**, which is a request the owner answers — by the time a shop asks,
  the bread may already be baked.
- **Owner**: a Problems queue in `/admin`, sorted by what the problem is
  costing the buyer right now rather than by when it arrived, so working
  top-down is the right order without anyone deciding it. Reply (emailed to
  the buyer immediately), a private note the buyer never sees, and close.
  A case cannot be closed without writing something first.
- A case about an order also lands in that order's history.
- The buyer sees a timeline of their own order — the buyer-visible events
  only, never the bakery's internal notes.

**Not done:** photo attachments. The reason prompt asks for a photo by reply
to the email instead. Storing customer-uploaded images means a storage bucket,
a size limit, and a retention policy, and it was not worth holding the rest of
this release for.

**On the fourteen order states the audit listed:** the system has seven, not
fourteen. `received`/`payment authorized` are a Stripe concern, `accepted` and
`scheduled` are the same event at a bakery that bakes to order, and
`in production` is what the bake sheet already shows. States nobody sets
honestly become states nobody trusts. If the bakery grows a second shift and
the distinctions start to mean something, they are one migration away.

### 8. Notification preferences — **closed in v22**

The audit could not see this: v22 added a notification settings screen keyed
to the device's push token rather than the session, so turning alerts off is
never blocked by an expired sign-in. Operationally required messages —
tracking, invoices, account decisions — cannot be suppressed.

### App-store operational readiness — **closed in v22**

Also invisible to a v21 audit. v22 added the legal, support, about, delete-
account and notification screens Apple requires, plus a self-provisioning
review account so App Review can actually sign in — which had been the single
thing most likely to fail the submission.

---

## P1 — honestly still open

These are real, and none of them is closed. They are listed with what would
have to be true, so the decision is yours rather than a surprise later.

| # | Gap | Why it is still open |
| --- | --- | --- |
| 2 | Lot/batch traceability, production board | A recall today is answerable from the order list — filter **All**, export the CSV, and every order carries the buyer, the date, and what was in it. What is missing is *which batch* went to which shop. That needs a lot ID on the bake and on the pack, which is a change to how the bench works, not only to software. |
| 3 | Local delivery routes, pickup, delivery windows | The system is parcel-only, and says so to buyers. If Dallas Bakery runs its own van to Dallas-area accounts, this is the largest missing path in the product and deserves its own release: fulfilment method per location, zones, route days, driver manifest, proof of delivery. |
| 4 | Accounting integration, tax calculation | Invoices, statements, and a line-level CSV export exist. QuickBooks/Xero integration, credit memos, write-offs, and payment application do not. **Sales tax is not calculated or collected** — see `COMPLIANCE_SIGNOFF.md` §2, which is the single line on that page that can cost real money. |
| 5 | Multiple users and roles per business | Today a business is one email. A shop with a separate accounts-payable contact shares a login. This needs a users table, invitations, and roles — a real feature, and the right one to do next after delivery. |
| 6 | Catalog search, saved templates, quick order | Wholesale buyers reorder rather than browse; "order these cases again" exists on every past order, and standing orders cover the weekly case. Search, favourites, CSV quick-entry, and a downloadable spec sheet do not. |
| 7 | Standing-order preview, skip-next-run, end date | Standing orders can be paused and edited, and a failed off-session charge emails the buyer. Next-run preview, skip-one-week, and an end date are not there. |
| — | Offline behaviour, biometric unlock, deep links, accessibility audit, analytics | The apps need a device-based pass for each. Screen-reader labels and touch targets are written into every screen, but written is not verified: VoiceOver and TalkBack testing on real hardware is on the checklist. |
| — | Adversarial security verification | The audit is right that the controls need testing rather than reading. Cross-account authorization, token replay, and brute-force testing against a live staging environment are checklist items, not code. |

---

## One correction

The audit says:

> *The repository contains `node_modules` and build artifacts after
> verification in the working tree.*

The working tree does, because that is what a working tree is. **The delivered
archive does not.** The packaging step excludes `node_modules`, `.wrangler`,
`dist`, `.next`, `.expo`, `.dev.vars`, and `.sites-runtime`, and the v21 zip
the audit was run against contains zero `node_modules` entries — I checked
before writing this rather than assuming. The auditor appears to have unzipped
into a directory where a build had already been run, or reviewed a tree rather
than the artifact.

The rest of that paragraph stands and is worth doing: review the final archive
for secrets and test credentials before every handover.

---

## What changed in v23, in one place

- `drizzle/0016_order_lifecycle_and_support.sql` — hold/cancel/refund columns
  on orders, plus the `order_events` and `support_cases` tables.
- `app/order-status.ts` — the state machine and the refund assessment.
- `app/order-operations.ts` — hold, release, correct, cancel, refund, deliver.
- `app/order-events.ts` — the append-only history.
- `app/support-cases-rules.ts`, `app/support-cases.ts` — problems and replies.
- `app/webhook-intake.ts` — the reconciliation decisions, unit-tested.
- `app/observability.ts`, `app/api/health/route.ts` — logs, alerts, health.
- `scripts/backup-database.sh` — backup with a restore that is actually run.
- `OPERATIONS.md`, `COMPLIANCE_SIGNOFF.md`, `LAUNCH_CHECKLIST.md` §5.

Thirty-seven new tests, 175 passing in total, lint and strict TypeScript clean.
