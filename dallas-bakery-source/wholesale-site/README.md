# Dallas Bakery Wholesale

Launch source for the customer wholesale website and branded owner approval portal at `dallasbakery.net`. It uses Next.js/Vinext on Cloudflare, D1 for applications and live business settings, and a behind-the-scenes commerce connection for approved-buyer catalogs and checkout.

## Customer and owner flows

- `/` presents the wholesale offer without exposing private pricing.
- `/apply` collects a business application and makes the delivery address the primary storefront.
- The server quietly checks address deliverability and commercial classification, blocks mailbox/residential or clearly unrelated locations, rate-limits abuse, and sends uncertain matches to owner review.
- Buyer-app applications receive a high-entropy tracking credential. Only its HMAC hash is stored, and it exposes a minimal no-cache approval status to that device.
- `/admin/login` is the Dallas Bakery-branded owner sign-in. It does not use ChatGPT sign-in.
- `/admin` lets the owner search, review, annotate, approve, decline, retry store setup, and change the live shipping rate.
- `/order` hands approved buyers to a branded account experience for passwordless sign-in, private catalogs, location selection, checkout, and order history.
- The separate native buyer app uses public-client PKCE sign-in, buyer/location-contextualized catalog data, and the same live shipping setting without exposing wholesale pricing to anonymous users.
- Shipping defaults to **$12.50 per box of up to 25 units**. The website, owner app, public settings API, and checkout callback all read the same D1 row.
- `/privacy` and `/terms` cover the application data and wholesale access rules.
- Email notifications send from the wholesale domain (`wholesale@dallasbakery.net`) with replies routed to `sales@dallasbakery.com`: the owner is emailed on every new application, applicants are emailed on approval or decline (decline emails stay neutral and never include owner notes), and a follow-up goes out when a retried store setup completes. Mail is best-effort — an outage can never block a decision — and `/admin` shows whether the mail connection is active.

## Requirements

- Node.js 22.13 or newer
- A Cloudflare D1 binding named `DB`
- A production HTTPS hostname
- The commerce backend configured before buyer ordering is opened
- Smarty and Google Places credentials if automatic storefront screening is required

Without the Smarty or Google credentials, applications are accepted as `owner_review`; they are never silently auto-approved. The owner dashboard shows which launch connections are active.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Run every local release gate with:

```bash
npm run verify
```

That command runs ESLint, strict TypeScript checks, a production build, and unit tests.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `ADMIN_LOGIN_EMAIL` | Set to `sales@dallasbakery.com`. |
| `ADMIN_BOOTSTRAP_PASSWORD_HASH` | PBKDF2 hash for the temporary owner password. Never store the plaintext password. |
| `ADMIN_SESSION_SECRET` | Random secret of at least 32 bytes for signed eight-hour sessions. |
| `ADMIN_LOGIN_EPOCH` | Credential/session generation. Increment it to revoke sessions and reset the owner password to the current bootstrap hash. |
| `APPLICATION_RATE_LIMIT_SECRET` | Random secret used to hash public rate-limit identifiers. |
| `APPLICATION_RATE_LIMIT_EPOCH` | Increment to rotate public rate-limit identifiers. |
| `APPLICATION_TRACKING_SECRET` | Random secret of at least 32 bytes for hashing buyer-app application tracking credentials. |
| `PUBLIC_SITE_URL` | Production site origin, normally `https://dallasbakery.net`. |
| `MAIL_API_KEY` | Transactional mail API key. Leave empty to disable all notification email. |
| `MAIL_FROM` | Sender identity on the wholesale domain, e.g. `Dallas Bakery Wholesale <wholesale@dallasbakery.net>`. SPF/DKIM/DMARC go on `dallasbakery.net` — see `DEPLOYMENT.md`. |
| `MAIL_REPLY_TO` | Where replies land, normally `sales@dallasbakery.com`. |
| `MAIL_OWNER_TO` | Where new-application alerts go. Defaults to `ADMIN_LOGIN_EMAIL`. |
| `MAIL_API_URL` | Optional override of the mail endpoint (defaults to Resend's `/emails`). |
| `SMARTY_AUTH_ID` / `SMARTY_AUTH_TOKEN` | Commercial-address and deliverability screening. |
| `GOOGLE_PLACES_API_KEY` | Storefront and food-business category screening. |
| `STRIPE_SECRET_KEY` | Server-only Stripe key. Prices and charges every order; must never reach a browser or an app build. |
| `STRIPE_PUBLISHABLE_KEY` | Stripe key sent to the card form on the site and in the app. Safe to publish. |
| `STRIPE_WEBHOOK_SECRET` | Signs `/api/webhooks/stripe`. Without it paid orders are never recorded. |

Generate a password hash locally without putting the password in shell history:

```bash
read -s -p "Temporary owner password: " DB_ADMIN_PASSWORD; echo
printf '%s' "$DB_ADMIN_PASSWORD" | npm run --silent admin:hash-password
unset DB_ADMIN_PASSWORD
```

Generate session/rate-limit secrets with `openssl rand -base64 48`.

### Password recovery

1. Generate a new temporary-password hash.
2. Replace `ADMIN_BOOTSTRAP_PASSWORD_HASH` in the host settings.
3. Increment `ADMIN_LOGIN_EPOCH` (for example, `1` to `2`).
4. Sign in with the temporary password and immediately choose a new private password.

The epoch change revokes existing browser and mobile sessions. There is intentionally no public password-reset endpoint.

## Database migrations

Drizzle schema lives in `db/schema.ts`; committed migrations live in `drizzle/`. Generate a migration after schema changes with:

```bash
npm run db:generate
```

The current migrations create applications, owner credentials and lockouts, store-sync fields, consent records, hashed public-submission limits, and the live shipping setting.

## Deploying outside the original hosting platform

`DEPLOYMENT.md` documents the standalone path to Dallas Bakery's own
Cloudflare account: `wrangler.deploy.jsonc`, `npm run db:migrate`, secret
setup, and `npm run deploy`. The original platform keeps working unchanged.

## Launch sequence

1. Run `npm run verify` and keep the working tree clean.
2. Configure every required runtime variable.
3. Apply the committed D1 migrations through the hosting release flow.
4. Add the Stripe keys, then point a Stripe webhook at `https://dallasbakery.net/api/webhooks/stripe` for `payment_intent.succeeded` (wholesale) and `checkout.session.completed` (retail), and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Connect `dallasbakery.net`, confirm HTTPS, and verify the canonical/OG URLs.
6. Make the customer site publicly accessible in hosting; application-owned auth continues to protect `/admin` and all owner APIs.
7. Submit a real test application, approve it, confirm the company/location sync, sign in as that buyer, and complete test checkouts with 25 and 26 units.
8. Build the owner and buyer apps with `EXPO_PUBLIC_API_URL=https://dallasbakery.net` only after the domain and public API routes are live. The buyer app also needs `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`; its build fails loudly without one.

Do not launch automatic screening until the selected providers’ billing, usage limits, and privacy terms have been reviewed. Have counsel review the included privacy notice and wholesale terms for Dallas Bakery’s final policies.
