# v19 — the catalog belongs to the owner

## Products managed in /admin

The product catalog moves from source code into the database. A new
**Products** section in `/admin` covers everything a buyer sees and everything
UPS bills on:

- **Add** a bread (name, description, price per loaf, loaves per case, image,
  display order) — it is live on the website and the app the moment it saves.
- **Edit** any of it in place. Prices are entered per loaf in dollars; the
  case price shown to buyers is computed from it.
- **Hide / Show** takes a bread off sale without losing it.
- **Delete** removes it permanently. Orders snapshot their line items, so
  past orders, receipts, the shipping queue, and the CSV keep showing exactly
  what was sold. A standing weekly order that still references a removed bread
  fails its next run safely and emails its buyer, rather than charging for
  bread that will not be baked.

Migration `0011_products_table.sql` creates the table and seeds
the four current breads at the current prices, so a deployed store notices
nothing when the storage moves.

## Each product ships in its own box

Every product carries its own **packed-box weight and dimensions**, edited in
the same form. Labels are now bought from those numbers:

- A UPS shipment is built with **one package per case**, each package using
  its product's weight and size. A 27 lb Barbari case and a lighter mini case
  in the same order are each billed at their real weight.
- This also fixes a real pre-existing gap: a 3-box order used to buy **one**
  label; it now buys three, and the merged ZPL prints them back to back. The
  shipment's lead tracking number covers every box, so buyer tracking is
  unchanged.
- Orders whose products were deleted after the sale, and retail orders, fall
  back to the global parcel settings — never silently unshipped boxes.
- A per-shipment package cap (50) keeps a fat-fingered quantity from buying a
  wall of labels in one click.

Pricing structure honesty: the price authority did not move. Clients still
send SKUs and case counts only; `catalog-pricing.ts` (pure, tested) computes
every amount from rows the server loaded.

## Setup for humans

`SETUP_GUIDE.md` — a start-to-finish setup manual written for a business
owner, not a programmer: the five accounts, every secret and where its value
comes from, the Stripe webhook, Resend DNS, UPS, the day-to-day admin, the
app-store path, and a launch test checklist. The same manual ships as a
shareable web page.

## Verification

69 unit tests pass (57 site, 9 buyer app, 3 owner app). The product CRUD was
exercised end to end against the running site through the real admin session:
create → price/weight edit → hide → show → validation refusal → delete, and
the buyer catalog was confirmed to serve the database rows. The multi-package
UPS request shape is covered by tests; an actual UPS purchase still needs live
credentials, so create one test-environment label before the first real one.
