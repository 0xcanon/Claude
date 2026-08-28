# Dallas Bakery wholesale — screens and change log

Screens from the buyer app, the website, and the owner admin panel, plus the
patches that produced them.

## What's here

| Path | Contents |
|---|---|
| `screens/phone/` | 19 app screens at 390x844 @3x (iPhone 14 Pro), true device frame |
| `screens/full/` | The same screens at full scroll length |
| `screens/contact-sheet.png` | All 19 app screens on one sheet |
| `screens/website/` | 7 website + admin screens at 1440px @2x |
| `screens/website-contact-sheet.png` | The website and admin screens on one sheet |
| `patches/premium-launch.patch` | The current change, 76 files |
| `tools/` | Capture harness, fixtures, and the local-database seed |
| `CHANGES-v16.md`, `CHANGES-v17.md` | Release notes |

## Pricing

$2.50 a loaf, sesame $1.80. A 25-loaf case is **$62.50**; sesame **$45.00**.
Shipping is **per case** — one case is one box at $12.50, so three cases is
three boxes at $37.50.

## How the screens were made

**App** — `expo start` only serves the Metro bundler, so the app is rendered
through Expo's web target and captured with headless Chromium at a phone
viewport. `tools/App.harness.tsx` replaces `App.tsx` (the original is kept as
`App.original.tsx` and re-exported when no `?screen=` is present) and mounts one
screen at a time against `tools/screenshot-fixtures.ts`. No screen component is
modified.

**Website and admin** — captured from the site actually running under
`npm run dev`, against a local database seeded by `tools/seed-local-db.mjs`
(one approved buyer, three orders spanning the three shipping stages, one admin
account). The prices, totals, and tracking states in those screens are computed
by the real code, not mocked.

```bash
cd wholesale-site && npm ci
node ../tools/seed-local-db.mjs      # writes .wrangler local D1
npm run dev
node ../tools/capture-website.mjs
node ../tools/capture-admin.mjs
```

Stripe's card UI is not in these screens: the web Payment Element and the app's
PaymentSheet both need a live PaymentIntent, which needs `STRIPE_SECRET_KEY`.
`12-payment` is the app's own review screen and `13-order-success` is its
confirmation; both are Dallas Bakery screens, not Stripe's.

## patches/premium-launch.patch

76 files across `wholesale-site`, `buyer-mobile-app`, and `owner-mobile-app`.
Apply to a clean v15 tree:

```bash
patch -p1 < patches/premium-launch.patch
mkdir -p wholesale-site/public/images
cp <case.jpg> wholesale-site/public/images/case.jpg   # binary, ships beside the patch
```

See `CHANGES-v17.md` for the full write-up. Headlines:

- **Order tracking** — one shared vocabulary (Baking / Packed / Shipped) across
  app, website, and admin. Tracking is offered only once a parcel has actually
  shipped, because a tracking number exists from the moment a label is bought
  but UPS has nothing to show before the scan.
- **Admin** — fixed the shipping queue rendering dark-on-dark inside the filter
  toolbar; added a day summary and an expandable "what was ordered".
- **Branded checkout** — the Payment Element and PaymentSheet are themed as
  Dallas Bakery; the pay button reads "Pay Dallas Bakery $225.00".
- **Premium storefront** — two-column shop with sticky summary, real product
  photography (the catalog previously pointed at four image paths that did not
  exist), per-case pricing copy throughout.
- **Fixed a hydration mismatch** on `/order` introduced in v16.

### Verification

53 unit tests pass (41 site, 9 buyer, 3 owner), TypeScript clean in all three
projects, the site lints and builds — re-run against a fresh unzip of v15 with
the patch applied, not just the working tree.

Not verified: no live Stripe call. Place one real card order on each surface
before launch.
