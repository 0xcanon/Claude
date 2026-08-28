# Deploying to Dallas Bakery's own Cloudflare account

The original hosting platform can keep deploying this site with no changes —
its control plane injects the D1 binding automatically and ignores the files
described here. This document exists so Dallas Bakery can also deploy and
re-deploy **independently**, using only its own Cloudflare account.

Everything below runs from `wholesale-site/`.

## One-time setup

1. **Sign in to Cloudflare**

   ```bash
   npx wrangler login
   ```

2. **Create the database**

   ```bash
   npx wrangler d1 create dallas-bakery-wholesale
   ```

   Copy the `database_id` from the output into `wrangler.deploy.jsonc`,
   replacing `REPLACE_WITH_D1_DATABASE_ID`.

3. **Apply the migrations**

   ```bash
   npm run db:migrate
   ```

   This applies every file in `drizzle/` (0000 through 0006) to the remote
   database, in order, and records what has been applied. Re-running it later
   applies only new migrations. For a local test database use
   `npm run db:migrate:local`.

4. **Set the secrets**

   For every value in `.env.example`, run:

   ```bash
   npx wrangler secret put <NAME> --config wrangler.deploy.jsonc
   ```

   Required before the owner can sign in: `ADMIN_LOGIN_EMAIL`,
   `ADMIN_BOOTSTRAP_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`,
   `ADMIN_LOGIN_EPOCH`. Required before applications flow end to end:
   `APPLICATION_RATE_LIMIT_SECRET`, `APPLICATION_TRACKING_SECRET`,
   `MAIL_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`. The Stripe, Smarty,
   Google, and checkout-rate values can follow later; each feature reports
   its own readiness in `/admin`.

5. **Verify the build output paths once**

   ```bash
   npm run build
   ls dist
   ```

   `wrangler.deploy.jsonc` expects the worker entry at `dist/worker/index.js`
   and static assets at `dist/client`. If the build emits different paths,
   update those two lines — they are the only environment-specific paths in
   the file.

6. **Deploy**

   ```bash
   npm run deploy
   ```

7. **Connect the domains**

   In the Cloudflare dashboard, add `dallasbakery.net` as a custom domain on
   the deployed Worker. Buyers sign in and order at `dallasbakery.net/order`,
   so no second hostname is needed.

## Email DNS (sending from dallasbakery.net)

Application and decision emails send from the wholesale domain (for example
`wholesale@dallasbakery.net`) with replies routed to `sales@dallasbakery.com`.
Before the first approval goes out:

1. Create the sending domain `dallasbakery.net` with the mail provider
   (the transport is compatible with Resend's `/emails` endpoint; set
   `MAIL_API_URL` to use a different provider's compatible endpoint).
2. Add the SPF and DKIM records the provider issues **on the dallasbakery.net
   zone**, plus a DMARC record, e.g.
   `_dmarc.dallasbakery.net TXT "v=DMARC1; p=quarantine; rua=mailto:sales@dallasbakery.com"`.
3. Send yourself a test approval and confirm it lands in the inbox, not spam,
   and that replying reaches `sales@dallasbakery.com`.

## Every later release

```bash
npm run verify      # lint + strict types + build + unit tests
npm run db:migrate  # only when drizzle/ gained new files
npm run deploy
```

## Stripe order intake

1. In Stripe → Developers → Webhooks, add an endpoint pointing at
   `https://dallasbakery.net/api/webhooks/stripe` and subscribe it to
   **checkout.session.completed**.
2. Copy the signing secret (`whsec_…`) and set it:
   `npx wrangler secret put STRIPE_WEBHOOK_SECRET --config wrangler.deploy.jsonc`
3. Both stores send to this one endpoint. The retail Worker already tags its
   sessions with `metadata.channel=retail` and `metadata.loafCount`; the
   wholesale checkout must tag `channel=wholesale` the same way.
4. Place a test order and confirm it appears in the `/admin` shipping queue.

## UPS shipping labels

1. At developer.ups.com, create an app on your UPS account and add the
   **OAuth**, **Shipping**, **Rating**, and **Address Validation** products.
   (If a product is missing from the create form, save the app and edit it.)
2. Set the credentials:

   ```bash
   npx wrangler secret put UPS_CLIENT_ID --config wrangler.deploy.jsonc
   npx wrangler secret put UPS_CLIENT_SECRET --config wrangler.deploy.jsonc
   npx wrangler secret put UPS_ACCOUNT_NUMBER --config wrangler.deploy.jsonc
   ```

3. Leave `UPS_ENVIRONMENT=test` and create a label against UPS's test
   environment first. Test labels are not real shipments and are not billed.
4. The carton is set to 24 x 16 x 6 in and the packed-box weight to the
   owner's measured **27 lb** (432 oz), so every label bills UPS 27 lb. At
   2,304 cubic inches this carton has a dimensional weight of roughly 14–17 lb
   depending on the account's divisor, so at 27 lb actual weight the actual
   weight governs. If the packing ever changes, re-weigh and update the
   weight under Live order settings in `/admin` — UPS bills on it, so a wrong
   number costs money on every label.
5. Switch `UPS_ENVIRONMENT=production`, create one real label, and print it
   to the thermal printer before relying on the batch button.

### Printing the batch

*Print* downloads a single `.zpl` file holding every selected label. Send it
straight to the Zebra or Rollo — on macOS or Linux
`lp -d <printer> file.zpl`, on Windows `copy /b file.zpl \\\\localhost\\<printer>`,
or drop it into the printer's own utility. Do not open it in a PDF viewer;
it is raw printer language, not a document.
