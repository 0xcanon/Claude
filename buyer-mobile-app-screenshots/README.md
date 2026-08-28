# Dallas Bakery buyer app — screenshots

Screenshots of every screen in `buyer-mobile-app` from
`Dallas-Bakery-Wholesale-Launch-Source-v15`, captured from the app actually
running under `npx expo start`.

## What's here

| Folder | Contents |
|---|---|
| `screens/phone/` | 14 screens at 390×844 @3x (1170×2532 — iPhone 14 Pro), the true device frame |
| `screens/full/` | The same screens at full scroll length, so nothing below the fold is cut |
| `screens/contact-sheet.png` | All 14 screens on one sheet |
| `tools/` | The harness used to produce them |

Screens: welcome · apply step 1 · apply step 2 · status (pending) ·
status (approved) · sign-in (email) · sign-in (code) · home · catalog ·
product detail · cart · orders · locations · account.

The captures show the app **after** the case-pricing change in
`patches/case-pricing.patch` — bread is priced and ordered by the case
($50.00 per case, 25 loaves, $2.00 a loaf), not by the loaf in increments
of 25.

## How they were made

`expo start` alone only serves the Metro bundler — there is no device in CI to
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
`App.original.tsx`, and is re-exported when no `?screen=` parameter is present).
With `?screen=<name>` it mounts a single screen against the fixture data in
`tools/screenshot-fixtures.ts`, so authenticated screens — catalog, cart,
orders, account — can be captured without a live Shopify backend or an approved
buyer session. No screen component was modified.

## Note on one web-only rendering difference

`ProductCard`'s image uses `{ width: "100%", aspectRatio: 1.28 }`. Yoga applies
that correctly on iOS/Android, but `react-native-web` resolves the height
against the stretched flex row instead of the image's own width, which made
catalog tiles render ~4.5× too tall in the browser. The capture script injects a
one-line CSS correction so the screenshots match on-device layout. This is a
`react-native-web` artifact only — it does not affect the shipping app, which
never runs on web.

The `Switch` on apply step 2 also draws with the browser's default thumb colour
rather than `colors.paper`, for the same reason.

## Fixture data

All names, addresses, order numbers, and the sign-in code are invented sample
data (`Saffron Kitchen Group`, `mina@saffronkitchen.com`). Shipping defaults
($12.50 per 25-unit box) match the app's own `DEFAULT_SHIPPING`.


## `patches/case-pricing.patch`

Converts the buyer app's pricing and quantity UI from loaves to cases.
Apply to a clean v15 tree with `patch -p1 < patches/case-pricing.patch`;
11 files, +209/−46.

The server was already case-based: `/api/buyer/catalog` sends the price of a
whole case as `variant.price.amount` with `quantityRule: { minimum: 1,
increment: 1 }`, and `/api/buyer/checkout` takes `{ sku, cases }`. Only the
mobile UI still read those numbers as loaves, so this brings the app in line
with the contract the website's order portal already follows.

What changed:

- **Product card / detail** — "$50.00 per case" with "25 loaves · $2.00 each"
  underneath; the stepper counts cases (1, 2, 3), not loaves (25, 50, 75).
- **Cart** — lines read "2 cases × $50.00 / 50 loaves"; the subtotal row
  names the case count.
- **Catalog / home / welcome** — cart button reads "VIEW CART · 3 CASES";
  home shows the real cheapest case price from the buyer's own catalog
  (labelled FROM when cases are not all one price) instead of a hardcoded
  `$2.50`.
- **`format.ts`** — adds `loavesPerCase`, `loafPrice`, `cartLoaves`,
  `caseLabel`, `loafLabel`, and documents that cart quantities are cases.
- **`wholesale-catalog.ts`** — `catalogForClients()` now publishes
  `unitsPerCase`, so the app reads the case size instead of assuming 25.
  The app still falls back to 25 when the field is absent.

### Shipping bug fixed along the way

`CartScreen` passed the **case count** to `shippingEstimate`, which bills per
box of **loaves**. With `unitsPerBox: 25`, a 3-case order estimated
`ceil(3/25)` = 1 box ($12.50) while the server's `priceCart` charged
`ceil(75/25)` = 3 boxes ($37.50) — the buyer saw $25.00 less than they were
charged. The cart now converts to loaves first with `cartLoaves`, and a
regression test pins both the correct result and the old wrong one.
