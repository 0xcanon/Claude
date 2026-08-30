# Running Dallas Bakery Wholesale

This is the day-to-day book: what to do each morning, what to do when
something goes wrong, and how to get the business back if the worst happens.

It is written for whoever is standing at the bench, not for a developer. Every
instruction is a thing you can actually do from `/admin` or a terminal.

---

## The daily round

**Morning, before baking**

1. Open `/admin`. The shipping queue shows what was ordered overnight.
2. Read the **bake sheet** at the top — that is how many cases of each bread
   to make. Nobody should be counting orders by hand.
3. Look at **Problems**. Anything marked *Answer today* is a shop that is
   short of bread right now. Deal with those before you deal with email.

**After the bake**

4. Select the orders, press **Create labels**, then **Download** and send the
   file to the thermal printer.
5. Press **Mark shipped**. That emails and push-notifies every buyer their
   tracking number. Do not skip it — it is the promise the site makes.

**Once a week**

6. Look at the invoice list for anything overdue. An overdue account is
   automatically locked to card payment until it is settled, so an unpaid
   invoice cannot quietly grow.
7. Take a backup (below).

---

## When something goes wrong with an order

Open the order in the shipping queue and press **What was ordered**. The
actions are under *If something's wrong*, and underneath them is the order's
complete history — every change, who made it, and when.

| What happened | What to do |
| --- | --- |
| Out of an ingredient; the order will be late | **Put on hold** with a reason. The buyer sees the reason. Nothing gets baked for it until you take it off hold. |
| Wrong address, phone, PO number, or delivery day | **Fix the details.** Only works before a label is bought. |
| Buyer wants to cancel | The order shows *asked to cancel*. **Cancel the order** with a reason. A card order is refunded in full automatically; an invoiced order simply releases the credit. |
| Short or damaged shipment, order still going out | **Send money back** with the amount and a reason. The rest of the order still ships. |
| The whole thing has to be undone after shipping | **Send money back** for the full amount. |
| UPS says delivered | **Mark delivered.** |

Two things the system will not let you do, on purpose:

- **You cannot refund more than the order was charged**, counting anything
  already sent back. The check happens before Stripe is called.
- **You cannot "refund" an invoiced order.** Nothing was charged. Cancelling
  it puts the amount back on the buyer's credit line, which is the real fix.

Every one of these writes a line into the order's history with your email on
it. That history is never edited or deleted. It is what answers a chargeback,
an accountant, or a buyer who remembers the conversation differently.

---

## Answering a problem a buyer raised

`/admin` → **Problems**. Cases are sorted by what they are costing the buyer
right now, not by when they arrived, so working top-down is the right order.

- **What we're telling them** is emailed to the buyer the moment you press
  send. Write it as if you were speaking to them, because you are.
- **Your own note** is never shown to the buyer. Use it for the pattern you
  are noticing — *"third short from the Tuesday pallet"*.
- **Send it and close the case** does both. You cannot close a case without
  writing something first; someone is waiting.

If the problem is about an order, it also appears in that order's history, so
you never have to hold two screens in your head at once.

---

## Knowing something is broken

**The health check.** `https://dallasbakery.net/api/health` returns plain JSON
and says whether the database answers and which services are connected. Point
any uptime monitor (UptimeRobot's free tier is enough) at it every five
minutes and have it alert you on anything that is not HTTP 200. Only the
database can turn it red — a missing Stripe key is reported as `missing` and
is a configuration problem, not an outage.

**Owner alerts.** Set `MAIL_OWNER_TO` (or `ADMIN_LOGIN_EMAIL`) and the system
emails you when:

- a paid order could not be recorded — someone paid and is not in your queue;
- an order was charged a different amount than it prices at today;
- the standing-order run did not place every order;
- a UPS label could not be bought;
- the nightly invoice reminders failed.

You get at most one email an hour per kind of problem, so a broken UPS
connection will not bury you in four hundred messages. Each email says what
happened and what to do about it.

**The logs.** Every notable event is one line of JSON in the Worker log
(`wrangler tail`, or the Cloudflare dashboard). Tokens, codes, card numbers
and authorization headers are stripped before anything is written. Useful
things to search for:

| Search for | Means |
| --- | --- |
| `failure.` | Something went wrong that you were emailed about. |
| `webhook.duplicate` | Stripe delivered the same event twice. Normal; nothing was double-recorded. |
| `webhook.late_after_settlement` | Stripe retried an event for an order you already cancelled or refunded. Worth a look. |
| `cron.standing_orders` | The morning standing-order run, and how many went through. |

---

## Backups

**Take one weekly, and before every deploy.**

```
cd wholesale-site
npm run db:backup
```

That exports the live database to `backups/dallas-bakery-<date>.sql`, then
restores it into a throwaway local database and compares the row counts table
by table. If the counts do not match, the script fails and tells you not to
rely on that file. An export nobody has ever restored is not a backup; this is
why the check is part of the same command.

To practise the whole thing without touching anything live:

```
npm run db:backup:rehearse
```

**Where to keep them.** Not on the machine that made them. A backup that lives
only on the laptop it was taken from is one spilled coffee from being no
backup at all. Copy each one to cloud storage or an external drive. They
contain real customer names, addresses and order history, so treat them the
way you would treat a filing cabinet — they are excluded from git for exactly
this reason.

**Restoring.** This replaces everything currently in the live database, so
read the command twice before you run it:

```
npx wrangler d1 execute DB --remote --config wrangler.deploy.jsonc \
  --file backups/dallas-bakery-2026-01-15-0900.sql
```

Then sign in to `/admin` and check that today's orders are there. If you have
just restored an older backup, orders placed after that backup are gone — find
them in Stripe (they are all there, with amounts and emails) and re-enter
them.

---

## Deploying a change

```
cd wholesale-site
npm ci
npm run verify        # lint, typecheck, build, and the full test suite
npm run db:backup     # before, not after
npm run db:migrate    # only if drizzle/ gained a new file
npm run deploy
```

Then load `https://dallasbakery.net/api/health` and confirm it says `ok`.

If a deploy goes wrong, `wrangler rollback` puts the previous Worker back
immediately. Migrations do not roll back — that is what the backup is for.

---

## Who to call

| Thing | Where |
| --- | --- |
| Payments, refunds, disputes | Stripe dashboard → the payment, by order number |
| Labels, tracking, claims | UPS account, with the tracking number |
| Email not arriving | The mail provider's dashboard; check SPF/DKIM/DMARC on `dallasbakery.net` |
| The site itself | Cloudflare dashboard → Workers → the deployment log |
