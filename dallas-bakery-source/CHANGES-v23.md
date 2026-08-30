# v23 — the controls that make wholesale safe to run every day

v21 finished the storefront. v22 made the app submittable. v23 is what a
third-party audit said was still missing: what you do when an order goes
wrong, how you find out something broke, and how you get the business back if
the database disappears.

Full point-by-point reply to that audit: **`AUDIT-RESPONSE.md`.**
Day-to-day book: **`OPERATIONS.md`.**

---

## When an order goes wrong

Orders used to go one way: paid → labeled → shipped. Now they can be held,
corrected, cancelled, partly refunded, and marked delivered — and every one of
those writes a permanent line saying who did it, when, and why.

Open any order in the shipping queue. Under *If something's wrong*:

- **Put on hold** with a reason the buyer reads. Nothing is baked for a held
  order. **Take off hold** puts it back in the schedule.
- **Fix the details** — address, phone, PO number, requested delivery day —
  any time before a label is bought. The before-and-after goes into the
  history. A corrected address is re-checked against where you ship.
- **Send money back**, all of it or part of it. A short shipment can be
  refunded $45 while the rest of the bread still goes out.
- **Cancel the order** with a reason. A card order is refunded in full on the
  way out; an invoiced order releases the credit, because nothing was charged.
- **Mark delivered** once UPS says so.

Under those buttons is **Full history** — every change to the order, in order,
with a name against every line, and a *Print this history* link, because a
dispute response is a piece of paper rather than a screenshot. It is never
edited and never deleted.

The history covers the whole order, not only the parts that went wrong:
placing it, buying a label, a label UPS refused, handing the boxes over,
settling the invoice, and everything above. An order that went perfectly still
has a history. Lines the bakery should keep to itself — a UPS failure, your
note on a problem — are marked *internal* and never reach the buyer, who sees
the same story with those lines removed.

**Two things it will not let you do**, deliberately:

- Refund more than the order was charged, counting what has already gone back.
  Checked before Stripe is called.
- "Refund" an invoiced order. Nothing was charged — cancelling it puts the
  amount back on the buyer's credit line, and it says so.

Changing *what was ordered* is also not editable. That is a refund and a new
order, not a correction, and mixing the two is how books stop balancing.

## Buyers can tell you what went wrong

On the website and in the app, every order now has **Something wrong with this
order?** Seven reasons — damaged, short, wrong item, hasn't arrived, billing,
change request, other — each with a prompt asking for the detail that decides
what happens next. A fixed list rather than a blank box, so you can see that
three shops reported a damaged box on the same morning, which is a pallet
problem and not three unlucky customers.

Buyers can also **ask you to cancel**. It is a request, not the act: by then
the bread may already be baked, so you decide.

Your side is `/admin` → **Problems**, sorted by what each problem is costing
the buyer right now rather than by when it arrived — so working top-down is
the right order without anyone having to decide it. Reply and the buyer is
emailed immediately. Your own note beside it is never shown to them. You
cannot close a case without writing something first.

## Knowing something is broken

- **`/api/health`** — point an uptime monitor at it. It runs a real query and
  reports whether Stripe, UPS, mail and alerts are connected.
- **Owner alerts** — you get an email when a paid order can't be recorded,
  when an order was charged a different amount than it prices at today, when
  the standing-order run doesn't finish, when a UPS label fails, or when the
  invoice reminders fail. At most one an hour per kind, each saying what to do
  about it.
- **Structured logs** — every notable event is one line of JSON, with tokens,
  codes and card data stripped before writing.

## Backups you can actually restore

```
npm run db:backup
```

Exports the live database, then **restores it into a throwaway database and
compares the row counts table by table**. If they disagree it fails and tells
you not to trust that file. An export nobody has ever restored is not a
backup, which is why the restore is part of the same command.

`npm run db:backup:rehearse` practises the whole thing locally, touching
nothing live.

## Stripe can deliver the same thing twice

It does, routinely, and it retries for days. The decisions about what to do
are now in one tested file:

- The same event twice creates one order, never two.
- A captured webhook replayed an hour later is refused on its timestamp — the
  signature still matches, so this is the only thing that stops it.
- A retry arriving after you already cancelled the order is logged rather than
  quietly swallowed.
- If Stripe captured a different amount than the cart prices at today, **the
  charged amount goes on the order and the invoice** — it has to match the
  bank — and you get an email about the difference.

## Paperwork that needed a form, not code

- **`OPERATIONS.md`** — the morning round, what to do when an order goes
  wrong, how to read the logs, how to back up and restore, how to deploy, who
  to call.
- **`COMPLIANCE_SIGNOFF.md`** — food licensing, labels and allergens, sales
  tax, terms, insurance. A sheet to print and sign, with a name and a date
  beside each line. **Read §2.** This system does not calculate or collect
  sales tax; if tax is due on these sales that is a change to make before
  launch, not after.
- **`LAUNCH_CHECKLIST.md` §5** — the operational items, each with a blank for
  the date, the order number, and the person who did it.

---

## Under the hood

| File | What it is |
| --- | --- |
| `drizzle/0016_order_lifecycle_and_support.sql` | Hold/cancel/refund columns, `order_events`, `support_cases` |
| `app/order-status.ts` | The state machine and the refund assessment — one place, so every screen agrees |
| `app/order-operations.ts` | Hold, release, correct, cancel, refund, deliver |
| `app/order-events.ts` | The append-only history |
| `app/support-cases-rules.ts` / `app/support-cases.ts` | Reasons, priority, replies |
| `app/webhook-intake.ts` | Duplicate, replay, late-delivery and amount reconciliation |
| `app/observability.ts` / `app/api/health/route.ts` | Logs, throttled alerts, health |
| `scripts/backup-database.sh` | Backup with a restore drill that actually runs |
| `app/admin/order-actions-panel.tsx` / `app/admin/support-queue.tsx` | The owner's two new screens |
| `buyer-mobile-app/src/screens/ReportProblemScreen.tsx` | The buyer's |

**Migration:** run `npm run db:migrate` before deploying. `0016` is additive —
new columns with defaults and two new tables — so existing orders are
untouched and nothing has to be backfilled.

**Verified:** 175 tests passing (37 new), lint and strict TypeScript clean,
and the whole lifecycle exercised against a running server — hold, correct,
release, cancel, mark delivered, every refusal path, a buyer cancellation
request, a support case answered from `/admin` and read back in the buyer's
app, and the backup's restore drill.
