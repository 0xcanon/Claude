# Dallas Bakery Wholesale Buyer App

Native Expo/React Native customer app for iPhone and Android. It implements the approved buyer journey shown in the Dallas Bakery mobile UX: apply, track approval, sign in, select a business location, see private B2B pricing, build a cart, continue to secure checkout, and review orders.

The app is separate from `Dallas-Bakery-Owner-App`. Customer and owner credentials never share a login flow.

## Customer experience

- Dallas Bakery-branded welcome and wholesale application
- Quiet business screening through the same website API
- Encrypted application tracking with live pending, approved, and ready states
- OAuth 2.0 Authorization Code + PKCE approved-buyer sign-in
- Private catalog pricing contextualized to the signed-in buyer and selected company location
- Multiple approved storefront selector
- Quantity-rule-aware product and cart controls
- Live `$12.50 per 25-unit box` shipping estimate from the website setting
- B2B cart creation and branded secure checkout handoff
- Customer order history and status links
- Encrypted session storage in the iOS Keychain and Android Keystore
- No third-party commerce branding in customer-facing app labels

## Required production configuration

Copy `.env.example` to `.env` for local development. Configure the same public values as EAS environment variables for signed builds:

```text
EXPO_PUBLIC_API_URL=https://dallasbakery.net
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

Two values, both public. Everything else — sign-in, catalog, pricing, payment,
and order history — comes from the wholesale API.

### Buyer authentication

Email plus a six-digit code, checked against approved applications on
`dallasbakery.net`. There is no password and no third-party identity provider,
so there is nothing to reset or leak. The session that follows is an
HMAC-signed token held in encrypted native storage.

### Catalog and payment

1. Cases and prices come from `GET /api/buyer/catalog`. The app sends SKUs and
   case counts only, never money.
2. `POST /api/buyer/payment-intent` prices the cart server-side and returns a
   Stripe client secret scoped to that one amount.
3. Stripe's **PaymentSheet** collects the card. Card details go straight from
   the sheet to Stripe — they never enter this app's JavaScript, its memory, or
   Dallas Bakery's servers, which is what keeps the app out of PCI scope.
4. Stripe's webhook records the order; the confirmation screen polls
   `GET /api/buyer/order-status` for the order number.

Shipping is billed **one box per case**, matching `priceCart` on the server, so
the total the buyer approves is the total the card is charged.

Because PaymentSheet is a native module, card payment runs in a development or
production build (`eas build`), not in Expo Go. Under `expo start --web` the
app renders for layout review and reports card payment as unavailable.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

OAuth callback testing requires a development build with the registered custom URI scheme; Expo Go is not sufficient for the final authentication flow.

## Verify

```bash
npm test
npm run typecheck
```

Then test on physical iPhone and Android devices:

- new wholesale application and status refresh
- approved buyer sign-in and session expiry
- one and multiple company locations
- private catalog visibility and quantity rules
- 25-, 26-, and 51-unit shipping estimates
- cart checkout and post-purchase order history
- sign-out and encrypted-session removal

## Build and submit

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --platform all --profile preview
npx eas-cli build --platform all --profile production
npx eas-cli submit --platform all --profile production
```

Publishing requires Dallas Bakery’s Apple Developer, Google Play Console, and Expo accounts. Use `https://dallasbakery.net/privacy` for the privacy-policy URL and `sales@dallasbakery.com` for support.

## Security notes

- Wholesale prices and add-to-cart controls load only after an authenticated buyer and company location are present.
- The buyer session token and application tracking token are stored only in encrypted native storage.
- Application tracking tokens are high entropy; the website stores only an HMAC hash and returns minimal no-cache status data.
- The Stripe publishable key (`pk_…`) is a public client credential. The secret key (`sk_…`) is server-only and must never appear in an app build; `app.config.ts` fails the build if the configured key is not a `pk_` value.
- Amounts are never sent from the app. The server prices every cart, so a patched app cannot change what a card is charged.
- Buyer sessions expire and are cleared from encrypted storage on 401/403.
- Buyer-specific catalog responses are never cached by this app.

## Permanent app identifiers

- iOS bundle identifier: `com.dallasbakery.wholesale`
- Android package: `com.dallasbakery.wholesale`

Change these before the first store submission only if Dallas Bakery wants different permanent identifiers.

## Signed builds refuse placeholder settings

`app.config.ts` fails any EAS build (`EAS_BUILD=true`) whose
`EXPO_PUBLIC_API_URL` or `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` is missing or
still a placeholder, and refuses any Stripe key that is not a publishable
`pk_` value. Define both as EAS environment variables for the `preview` and
`production` profiles. Without them the app would install cleanly and then
dead-end at checkout, which is worse than a failed build.
