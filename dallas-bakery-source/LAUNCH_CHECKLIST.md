# Dallas Bakery Wholesale — Launch Checklist

Use this checklist before opening the website or submitting either app to an app store.

## 0. Re-verify the source

- [ ] Run `npm ci && npm run verify` in `wholesale-site/` (lint, strict TypeScript, production build, 16 unit tests).
- [ ] Run `npm ci && npm run typecheck && npm test` in `buyer-mobile-app/` and `owner-mobile-app/`.

## 1. Wholesale website

- [ ] Configure the runtime values listed in `wholesale-site/.env.example` in the production host; do not upload a plaintext `.env` file.
- [ ] Generate a temporary owner-password hash and strong session, rate-limit, tracking, and checkout-callback secrets.
- [ ] Set `ADMIN_LOGIN_EMAIL=sales@dallasbakery.com`.
- [ ] Configure notification email: `MAIL_API_KEY`, `MAIL_FROM` on the wholesale domain (e.g. `Dallas Bakery Wholesale <wholesale@dallasbakery.net>`), `MAIL_REPLY_TO=sales@dallasbakery.com`.
- [ ] Add the mail provider's SPF and DKIM records plus a DMARC record on the **dallasbakery.net** zone, then send a test approval and confirm inbox delivery and that replies reach `sales@dallasbakery.com`.
- [ ] Confirm the `/admin` "Launch connections" panel shows **Email notifications** active.
- [ ] If deploying outside the original hosting platform, follow `wholesale-site/DEPLOYMENT.md`: create the D1 database, set its id in `wrangler.deploy.jsonc`, run `npm run db:migrate`, set every secret, then `npm run deploy`.
- [ ] Apply all committed database migrations, including `0006_nice_darkstar.sql` for secure buyer application tracking.
- [ ] Add the commercial-address and business-category screening credentials.
- [ ] Connect `dallasbakery.net`, complete DNS/SSL validation, and set `PUBLIC_SITE_URL=https://dallasbakery.net`.
- [ ] Change hosting access to public only when launch configuration is complete. The app-owned `/admin` authentication continues to protect the owner portal.
- [ ] Sign in with the temporary owner password and immediately set a new private password.

## 2. Products, B2B accounts, and checkout

- [ ] Create the wholesale bread product at $2.50 per individual unit.
- [ ] Add the 14-day shelf-life, Kosher, and Halal product information.
- [ ] Enable customer accounts and B2B company/company-location support.
- [ ] Publish wholesale products to the intended private catalog and assign that catalog to approved company locations.
- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` as Worker secrets, and confirm `/admin` shows **Card payments** active.
- [ ] Configure a branded customer-account hostname and branded checkout theme.
- [ ] Point a Stripe webhook at `https://dallasbakery.net/api/webhooks/stripe` for `payment_intent.succeeded` and `checkout.session.completed`, set `STRIPE_WEBHOOK_SECRET`, and confirm a test order reaches the admin shipping queue.
- [ ] Place one real card order end to end (site and app) and confirm the order number, the emailed receipt, and the per-case shipping total all agree.
- [ ] Replace the homepage photos hot-linked from the retail store's CDN with files served from `wholesale-site/public/` so the wholesale site owns its own imagery.
- [ ] Confirm shipping totals: 1–25 units = $12.50; 26–50 = $25.00; 51–75 = $37.50.

## 3. Native customer app

- [ ] Create `buyer-mobile-app/.env` from its example for local work; define all five `EXPO_PUBLIC_*` values as EAS environment variables for the `preview` and `production` profiles — signed builds now fail if any is missing or still a placeholder.
- [ ] Use the **publishable** Stripe key (`pk_…`) in the app. The secret key (`sk_…`) must never appear in mobile or browser code; a signed build refuses to start without a `pk_` value.
- [ ] Register the Customer Account API client as a public mobile OAuth client using Authorization Code + PKCE.
- [ ] Register the exact custom redirect URI beginning with `shop.{shop_id}.`.
- [ ] Obtain any protected-customer-data approvals required for customer, company, location, and order access.
- [ ] Test application submission and live approval tracking against the production domain.
- [ ] Test one-location and multiple-location buyers; changing location must clear the cart and reload contextual pricing.
- [ ] Test private catalog, quantity rules, cart, secure checkout, session expiry (an expired session in the catalog or at checkout must return to sign-in, not a retry loop), order history, and sign-out on physical iPhone and Android devices.
- [ ] Submit the same application twice and confirm the second attempt shows the "already in review" notice without issuing a new tracking credential.
- [ ] Verify launch and splash screens render on both platforms in a signed build.

## 4. Native owner app

- [ ] Set `EXPO_PUBLIC_API_URL=https://dallasbakery.net` in the signed-build environment.
- [ ] Test owner login, required first password change, logout, and session expiry.
- [ ] Test pending/approved/declined queues, application details, owner notes, account-setup retry, and multiple-location display.
- [ ] Change the shipping rate in the owner app and confirm the website and buyer app immediately show the new value.

## 5. App-store builds and final acceptance

- [ ] Create production builds using Dallas Bakery's Apple Developer, Google Play Console, and Expo/EAS accounts.
- [ ] Set store listing support to `sales@dallasbakery.com` and privacy URL to `https://dallasbakery.net/privacy`.
- [ ] Verify icons, splash screens, bundle/package identifiers, signing, deep links, and release versions.
- [ ] Run a real low-risk order from application through approval, mobile sign-in, location selection, checkout, payment, shipping rate, confirmation, and order history.
- [ ] Verify a non-food business and a mismatched delivery address are routed safely without accusatory customer copy.
- [ ] Verify owner-only notes and screening details never appear in the buyer app or customer website.
- [ ] Confirm no backend-platform branding is visible in Dallas Bakery customer-facing pages or app screens.
- [x] Packed box weight confirmed at **27 lb** and stored (432 oz). If packing ever changes, re-weigh and update it under Live order settings in `/admin` — UPS bills on it.
