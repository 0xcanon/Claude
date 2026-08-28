# Dallas Bakery buyer app — screens and change log

Screenshots of every screen in `buyer-mobile-app`, captured from the app
actually running under `npx expo start`, plus the patches that produced them.

## What's here

| Path | Contents |
|---|---|
| `screens/phone/` | 17 screens at 390x844 @3x (1170x2532 - iPhone 14 Pro), the true device frame |
| `screens/full/` | The same screens at full scroll length, so nothing below the fold is cut |
| `screens/contact-sheet.png` | All 17 on one sheet |
| `patches/case-stripe-launch.patch` | The current change: per-case shipping, Shopify removal, card payments |
| `tools/` | The harness used to capture the screens |
| `CHANGES-v16.md` | Release notes for the patch |

Screens: welcome, apply step 1, apply step 2, status (pending), status
(approved), sign-in (email), sign-in (code), home, catalog, product detail,
cart, **payment**, **order success**, **order settling**, orders, locations,
account.

## How they were made

`expo start` alone only serves the Metro bundler - there is no device in CI to
photograph. So the app is rendered through Expo's web target and captured with
headless Chromium at a phone viewport.

```bash
cd buyer-mobile-app
npm ci
npx expo install react-dom react-native-web @expo/metro-runtime
npx expo start --web --port 8081
node capture.mjs          # from tools/, with playwright installed
```

`tools/App.harness.tsx` replaces `App.tsx` (the original is kept alongside it as
`App.original.tsx` and re-exported when no `?screen=` parameter is present).
With `?screen=<name>` it mounts a single screen against the fixture data in
`tools/screenshot-fixtures.ts`, so screens behind sign-in and payment can be
captured without a live backend or a real card. No screen component is
modified.

Stripe's PaymentSheet is a native module, so the card sheet itself cannot be
rendered on the web target. `12-payment` is the review screen that precedes it
and `13-order-success` is the confirmation that follows - both are the app's
own screens.

## patches/case-stripe-launch.patch

64 files across `wholesale-site`, `buyer-mobile-app`, and `owner-mobile-app`.
Apply to a clean v15 tree with `patch -p1 < patches/case-stripe-launch.patch`.
See `CHANGES-v16.md` for the full write-up. In short:

- **Shipping is billed per case.** `priceCart` sets `boxCount = caseCount`
  rather than dividing loaves by the retail box size, so three cases is always
  three boxes at $12.50 = $37.50. The app mirrors it exactly.
- **Shopify is gone** from every running path: the B2B module, the setup guide,
  the carrier-rate callback, the hosted-checkout route, the four
  `shopify_*` columns (migration `0009`), `COMMERCE_PLATFORM`, the owner app's
  store-sync UI, and four dead `EXPO_PUBLIC_*` values that would have failed
  every signed build.
- **Card payments on both surfaces.** `POST /api/buyer/payment-intent` prices
  the cart server-side; the site collects the card with Stripe's Payment
  Element and the app with Stripe's PaymentSheet; both then show a real order
  confirmation fed by `GET /api/buyer/order-status`. The webhook records
  `payment_intent.succeeded`, re-pricing through the same `priceCart` that set
  the charge.

### Verification

49 unit tests pass (37 site, 9 buyer, 3 owner), TypeScript is clean in all
three projects, the site lints clean, and `npm run build` succeeds - all
re-run against a fresh unzip of v15 with the patch applied, not just the
working tree.

Not verified: no live Stripe call was made, because that needs
`STRIPE_SECRET_KEY`. Place one real card order on each surface before launch.
