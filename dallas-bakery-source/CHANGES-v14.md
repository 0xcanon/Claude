# v14 — audit fixes

Every finding from the v13 end-to-end audit, resolved. Numbers refer to that
audit. Business decision applied throughout: **notification email sends from
the wholesale domain (`dallasbakery.net`), not `.com`** — `MAIL_FROM` defaults
in `.env.example` to `Dallas Bakery Wholesale <wholesale@dallasbakery.net>`
with `MAIL_REPLY_TO=sales@dallasbakery.com`, and `DEPLOYMENT.md` covers the
SPF/DKIM/DMARC records on the `.net` zone.

## Blocking

- **1.1 Notifications implemented.** New `wholesale-site/app/email-notifications.ts`
  (Resend-compatible JSON transport, `MAIL_API_URL` override for other
  providers, 10s timeout, never throws). Wired in three places: the owner is
  emailed on every new application (`verify-wholesale-business`), applicants
  are emailed on approval/decline (`wholesale-application-service`, only on a
  real status transition — saving notes never re-sends), and an
  "ordering is ready" email goes out when a retried store setup succeeds.
  Decline emails are neutral and structurally cannot contain owner notes.
  `/admin` shows a sixth "Email notifications" readiness row. 5 new unit
  tests cover the builders.
- **1.2 Signed buyer builds can't ship placeholders.** `app.config.ts` now
  throws during any EAS build if any of the five `EXPO_PUBLIC_*` values is
  missing or still a placeholder, with the fix in the error message.
  README documents the EAS environment variables.
- **1.3 Standalone deploy path added.** `wrangler.deploy.jsonc` (D1 with
  `migrations_dir: drizzle`, assets, IMAGES binding), npm scripts `deploy`,
  `db:migrate`, `db:migrate:local`, and `DEPLOYMENT.md` with the full
  sequence including secrets and domains. Named `wrangler.deploy.jsonc`
  deliberately so the original platform's dev/deploy flow is untouched.
  One residual step is flagged inside both files: confirm the built worker
  entry and assets paths against `npm run build` output once before the
  first standalone deploy (could not be exercised offline). `LICENSE.md`
  added with the ownership statement.

## High

- **2.1 Session expiry now recovers everywhere.** The storefront client
  throws a distinct expiry error on 401/403; the app treats it (and a
  locally expired token, pre-checked) as sign-out in both the catalog and
  checkout paths instead of a dead retry loop.
- **2.2 Approved buyers can always sign in.** The status screen shows the
  sign-in button as soon as the application is approved; while setup is
  still finishing it reads "Sign in to your account" and the copy says the
  storefront appears the moment setup completes.
- **2.3 Duplicate submissions no longer mint tracking tokens.** The server
  returns `alreadySubmitted` with no credential; the app shows a calm
  "already in review — we'll email the decision" notice instead of an
  error. The email/business/street/zip enumeration path is closed; the
  original device keeps its stored token.

## Medium

- **3.1/3.2** All three homepage `next/image` usages are `unoptimized`, so
  nothing depends on the undeclared `IMAGES` binding and images work in
  `npm run dev`. Self-hosting the photos (they still hot-link the retail
  CDN) is now an explicit checklist item; the deploy config declares the
  IMAGES binding for whenever optimization is turned back on.
- **3.3** Sign-out now also ends the hosted account session best-effort via
  the OpenID `end_session_endpoint` with `id_token_hint`.
- **3.4** `npm run build` falls back to an unbounded build with a warning
  when GNU `timeout` is unavailable (macOS/Windows) instead of exiting 69.
- **3.5** `CHECKOUT_RATE_SERVICE_ACTIVE` is now a real switch: while off,
  the rate callback answers 503 and checkout uses the backup rate. Setup
  docs reordered (turn on → register → add to profile → test) and the flag
  documented as the kill switch.
- **3.6** Both apps configure the splash via the `expo-splash-screen`
  plugin (dependency was already declared); legacy `splash` key kept for
  older tooling. Verify rendering in a signed build per the checklist.

## Low

- `SHOPIFY_SETUP.md` now points at `buyer-mobile-app/README.md`.
- Empty `app/dashboard-preview/` directory removed.
- `public/robots.txt` (disallows `/admin` and `/api/`) and
  `public/sitemap.xml` added.
- The buyer-app header no longer bypasses the origin check when a browser
  `Origin` header is present, so it can't be forged from a web page.

## Re-run before release

Dependencies could not be installed in the audit environment, so re-run
`npm ci && npm run verify` in `wholesale-site/` and
`npm ci && npm run typecheck && npm test` in both apps, plus one Metro
export per platform. All 22 unit tests (16 site + 3 + 3) pass as shipped.
