# Dallas Bakery Wholesale — Launch Checklist

Use this checklist before opening the website or submitting either app to an app store.

## 0. Re-verify the source

- [ ] Run `npm ci && npm run verify` in `wholesale-site/` (lint, strict TypeScript, production build, and the full unit-test suite — 192 tests at the last packaging; the number only ever goes up, so treat a smaller count as a problem).
- [ ] Run `npm ci && npm run typecheck && npm test` in `buyer-mobile-app/` and `owner-mobile-app/`.

## 1. Wholesale website

- [ ] Configure the runtime values listed in `wholesale-site/.env.example` in the production host; do not upload a plaintext `.env` file.
- [ ] Generate a temporary owner-password hash and strong session, rate-limit, tracking, and checkout-callback secrets.
- [ ] Set `ADMIN_LOGIN_EMAIL=sales@dallasbakery.com`.
- [ ] Configure notification email: `MAIL_API_KEY`, `MAIL_FROM` on the wholesale domain (e.g. `Dallas Bakery Wholesale <wholesale@dallasbakery.net>`), `MAIL_REPLY_TO=sales@dallasbakery.com`.
- [ ] Add the mail provider's SPF and DKIM records plus a DMARC record on the **dallasbakery.net** zone, then send a test approval and confirm inbox delivery and that replies reach `sales@dallasbakery.com`.
- [ ] Confirm the `/admin` "Launch connections" panel shows **Email notifications** active.
- [ ] If deploying outside the original hosting platform, follow `wholesale-site/DEPLOYMENT.md`: create the D1 database, set its id in `wrangler.deploy.jsonc`, run `npm run db:migrate`, set every secret, then `npm run deploy`.
- [ ] Apply every committed migration in `wholesale-site/drizzle/` with `npm run db:migrate` (17 at the last packaging, through `0016_order_lifecycle_and_support.sql`), and confirm the run reports no pending files.
- [ ] Add the commercial-address and business-category screening credentials.
- [ ] Connect `dallasbakery.net`, complete DNS/SSL validation, and set `PUBLIC_SITE_URL=https://dallasbakery.net`.
- [ ] Change hosting access to public only when launch configuration is complete. The app-owned `/admin` authentication continues to protect the owner portal.
- [ ] Sign in with the temporary owner password and immediately set a new private password.

## 2. Products, pricing, and checkout

Products, buyer accounts, pricing and checkout all live in this system's own
`/admin`. There is no external storefront to configure.

- [ ] Add each bread in `/admin` → Products: name, SKU, case size, ingredients, allergens, shelf life, and the box weight and dimensions UPS is billed on.
- [ ] Confirm the 14-day shelf life, Kosher and Halal information reads the same in `/admin`, on the website, in the app, and **on the physical bag**.
- [ ] Set stock and daily capacity per product, and confirm an out-of-stock bread disappears from the buyer catalog rather than failing at checkout.
- [ ] Set the shipping rate and units per box under Live order settings, and confirm the website and both apps show the new value immediately.
- [ ] Re-weigh a packed box and store the weight and dimensions. UPS bills on these.
- [ ] Set the price for each approved customer in `/admin` → pricing. **Confirm a signed-in buyer sees only their own price, with nothing indicating anyone pays differently.**
- [ ] Open the site signed out and confirm **no price appears on any public page**, and that no public API endpoint returns one.
- [ ] Set `STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY` as Worker secrets, and confirm `/admin` shows **Card payments** active.
- [ ] Point a Stripe webhook at `https://dallasbakery.net/api/webhooks/stripe` for `payment_intent.succeeded` and `checkout.session.completed`, set `STRIPE_WEBHOOK_SECRET`, and confirm a test order reaches the shipping queue.
- [ ] Re-send that same webhook event from the Stripe dashboard and confirm it does **not** create a second order. Evidence: ______________________
- [ ] Place one real card order end to end (site and app) and confirm the order number, the emailed receipt, and the shipping total all agree.
- [ ] Grant Net 15 or Net 30 with a limit to one test account, place an order on account, and confirm no card is asked for and the available credit drops by the order total.
- [ ] Push that account past its limit and confirm the order is refused rather than allowed to go negative.
- [x] Homepage photography is served by this site. The four product photos that were hot-linked from the retail store's CDN now live in `wholesale-site/public/images/`, the remote-host allowlist is gone from `next.config.ts`, and `tests/no-hotlinked-assets.test.ts` fails if an external image URL comes back. `npm run deploy` runs the suite first, so a hot-link cannot reach production.
- [ ] Decide whether the bakery mark belongs on the product photographs. It is **off** today: every card already sits under the Dallas Bakery Wholesale header, so a mark on each photo repeats the brand three more times on one screen and shrinks the bread. It earns its place on images that leave the site — app-store screenshots, marketing email, a photo a buyer pastes into their own deck. To put it back: `python3 scripts/build-product-images.py --src <photos> --logo`.
- [ ] If you replace a photo, put the file in `wholesale-site/public/images/` and use a path beginning `/images/` — never a URL on another company's server, or that picture goes blank the day they change it. There are two separate places: the **homepage marketing photos** live in `app/page.tsx`, and each **product's catalog photo** is the Image path field in `/admin` → Products. The server refuses anything outside `/images/` in that field, and sends the apps an absolute URL so their photos load too.

## 3. Native customer app

- [ ] Create `buyer-mobile-app/.env` from its example for local work; define all three `EXPO_PUBLIC_*` values (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_EAS_PROJECT_ID`) as EAS environment variables for the `preview` and `production` profiles — signed builds fail if any is missing or still a placeholder.
- [ ] Use the **publishable** Stripe key (`pk_…`) in the app. The secret key (`sk_…`) must never appear in mobile or browser code; a signed build refuses to start without a `pk_` value.
- [ ] Sign in on a device with an emailed six-digit code and confirm the code arrives, expires, and cannot be reused. Buyer sign-in is this system's own; there is no external OAuth client to register.
- [ ] Confirm push notifications arrive on a physical device, and that turning them off in the app's notification settings stops them without breaking tracking or invoice email.
- [ ] Test application submission and live approval tracking against the production domain.
- [ ] Test one-location and multiple-location buyers; changing location must clear the cart and reload that location's own prices.
- [ ] Test the signed-in catalog, case minimums and increments, cart, checkout, session expiry (an expired session in the catalog or at checkout must return to sign-in, not a retry loop), order history, and sign-out on physical iPhone and Android devices.
- [ ] Report a problem from an order in the app, answer it in `/admin`, and confirm the reply reaches the buyer's inbox and shows in the app.
- [ ] Open an order's **Details & history** in `/admin` and confirm the audit trail reads correctly and prints.
- [ ] Submit the same application twice and confirm the second attempt shows the "already in review" notice without issuing a new tracking credential.
- [ ] Verify launch and splash screens render on both platforms in a signed build.

## 4. Native owner app

- [ ] Set `EXPO_PUBLIC_API_URL=https://dallasbakery.net` in the signed-build environment.
- [ ] Test owner login, required first password change, logout, and session expiry.
- [ ] Walk the five owner tabs on a real phone: Today's numbers and bake sheet, the shipping queue (buy a label, mark shipped), one order through hold → release → cancel with its history, answering a problem, and taking a bread off sale. Everything the owner app writes is signed with the admin email and appears in the same audit trail as the web portal.
- [ ] Test pending/approved/declined queues, application details, owner notes, account-setup retry, and multiple-location display.
- [ ] Change the shipping rate in the owner app and confirm the website and buyer app immediately show the new value.

## 5. Running it safely from day one

Everything in this section is in `OPERATIONS.md`, which is the day-to-day
book. These are the ones that have to be true *before* the first real order.

- [ ] Set `MAIL_OWNER_TO` (or rely on `ADMIN_LOGIN_EMAIL`) and confirm an owner alert actually arrives: temporarily break the UPS credentials, try a label, and check your inbox. Evidence: ______________________
- [ ] Point an uptime monitor at `https://dallasbakery.net/api/health` every 5 minutes, alerting on anything that is not HTTP 200. Monitor name and alert address: ______________________
- [ ] Load `/api/health` in production and confirm `stripe`, `ups`, `mail` all read **configured**. Date checked: ____________
- [ ] Run `npm run db:backup` against production and confirm it prints **Backup verified**. Date and row counts: ______________________
- [ ] Store that backup somewhere that is not the machine that made it, and write down where. Location: ______________________
- [ ] Do a restore drill: take a backup, restore it into a scratch database, and open the restored data. Who did it and when: ______________________
- [ ] Put a weekly backup in someone's calendar, with a name against it. Owner: ______________________
- [ ] Walk one order through hold → correct → release → cancel in `/admin` on the live site and confirm the history reads correctly. Order number used: __________
- [ ] Issue one real partial refund of a small amount and confirm it appears in Stripe, in the order history, and in the buyer's own order view. Order number: __________
- [ ] Raise a support case from the buyer app, answer it from `/admin`, and confirm the reply reaches the buyer's inbox. Date: ____________
- [ ] Complete and sign `COMPLIANCE_SIGNOFF.md` — food, tax, terms, and insurance. Signed on: ____________

> The tax line in `COMPLIANCE_SIGNOFF.md` is the one that can cost real money.
> **This system does not calculate or collect sales tax.** If tax is due on
> these sales, that is a change to make before launch, not after.

## 6. App-store builds and final acceptance

- [ ] Create production builds using Dallas Bakery's Apple Developer, Google Play Console, and Expo/EAS accounts.
- [ ] Set store listing support to `sales@dallasbakery.com` and privacy URL to `https://dallasbakery.net/privacy`.
- [ ] Verify icons, splash screens, bundle/package identifiers, signing, deep links, and release versions.
- [ ] Run a real low-risk order from application through approval, mobile sign-in, location selection, checkout, payment, shipping rate, confirmation, and order history.
- [ ] Verify a non-food business and a mismatched delivery address are routed safely without accusatory customer copy.
- [ ] Verify owner-only notes and screening details never appear in the buyer app or customer website.
- [ ] Confirm no backend-platform branding is visible in Dallas Bakery customer-facing pages or app screens.
- [x] Packed box weight confirmed at **27 lb** and stored (432 oz). If packing ever changes, re-weigh and update it under Live order settings in `/admin` — UPS bills on it.
