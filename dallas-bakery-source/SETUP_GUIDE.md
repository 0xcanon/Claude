# Dallas Bakery Wholesale — Setup Guide

**Written for a business owner, not a programmer.** Follow it top to bottom.
Where you see a `WORD_IN_CAPITALS`, that is a "secret" — a password-like value
you will copy from one place and paste into another. Never share secrets or
put them in email.

You will need: a computer, a credit card (for accounts — most are free), and
about half a day the first time.

One technical helper note: every command below is typed into the **Terminal**
(Mac: Applications → Utilities → Terminal; Windows: install "Git Bash").
Before any commands work you need one free program installed: **Node.js**
(nodejs.org → download the LTS version → install it like any app).

---

## Part 1 — Accounts to create (about an hour)

Create these accounts with your business email. Write each login down.

1. **Cloudflare** (cloudflare.com) — hosts the website. Free plan is fine to
   start; the Workers Paid plan ($5/mo) is recommended.
2. **Stripe** (stripe.com) — takes card payments. Free to open; Stripe keeps
   about 2.9% + 30¢ of each card payment.
3. **Resend** (resend.com) — sends your emails (sign-in codes, receipts,
   tracking). Free tier covers a small bakery easily.
4. **UPS Developer account** (developer.ups.com) — lets the site buy shipping
   labels on your existing UPS account. You need your UPS **account number**
   (on your UPS invoice).
5. Your **domain** (dallasbakery.net) must be in your Cloudflare account.
   If it is registered elsewhere, Cloudflare's "Add a site" walks you through
   pointing it over.

## Part 2 — Put the website live (about 2 hours)

Open Terminal, go to the `wholesale-site` folder inside the source code:

```bash
cd wholesale-site
npm install
npx wrangler login        # opens a browser — log into Cloudflare and approve
```

**1. Create the database.**

```bash
npx wrangler d1 create dallas-bakery-wholesale
```

This prints a `database_id` (long letters-and-numbers). Open the file
`wrangler.deploy.jsonc` in any text editor, find
`REPLACE_WITH_D1_DATABASE_ID`, and paste the id there. Save.

**2. Load the database tables** (also run this after every future update):

```bash
npm run db:migrate
```

**3. Set the secrets.** For each line below you will run
`npx wrangler secret put NAME --config wrangler.deploy.jsonc`, and paste the
value when it asks. Where a value should be "random", generate one by running
`openssl rand -base64 32` and copying the output. Do these:

| Secret | Where the value comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys → **Secret key** (starts `sk_live_`) |
| `STRIPE_PUBLISHABLE_KEY` | Same page → **Publishable key** (starts `pk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | See step 5 below — come back for this one |
| `MAIL_API_KEY` | Resend dashboard → API Keys → Create |
| `MAIL_FROM` | `Dallas Bakery Wholesale <wholesale@dallasbakery.net>` |
| `MAIL_REPLY_TO` | `sales@dallasbakery.com` |
| `ADMIN_LOGIN_EMAIL` | `sales@dallasbakery.com` |
| `ADMIN_BOOTSTRAP_PASSWORD_HASH` | Run `npm run admin:hash-password`, type a temporary password (14+ characters, letters and numbers), paste the printed line |
| `ADMIN_SESSION_SECRET` | random |
| `BUYER_SESSION_SECRET` | random |
| `APPLICATION_RATE_LIMIT_SECRET` | random |
| `APPLICATION_TRACKING_SECRET` | random |
| `PUBLIC_SITE_URL` | `https://dallasbakery.net` |
| `UPS_CLIENT_ID` / `UPS_CLIENT_SECRET` | developer.ups.com → your app's credentials |
| `UPS_ACCOUNT_NUMBER` | Your six-character UPS shipper number |
| `UPS_ENVIRONMENT` | `test` for now; change to `production` after one test label |

**4. Deploy the site:**

```bash
npm run deploy
```

Then in the Cloudflare dashboard: Workers & Pages → dallas-bakery-wholesale →
Settings → Domains & Routes → add `dallasbakery.net`.

**5. Connect Stripe's messenger (the "webhook").** This is how paid orders
reach your shipping queue. In Stripe: Developers → Webhooks → **Add endpoint**.
- Endpoint URL: `https://dallasbakery.net/api/webhooks/stripe`
- Events: select `payment_intent.succeeded` and `checkout.session.completed`
- After saving, Stripe shows a **Signing secret** (starts `whsec_`). Put it in
  the `STRIPE_WEBHOOK_SECRET` secret (step 3), then run `npm run deploy` again.

**6. Make your email deliverable.** In Resend: Domains → Add
`dallasbakery.net`. Resend shows 3–4 DNS records; add each one in Cloudflare →
your domain → DNS. Wait for Resend to show "Verified". **Until this is done,
buyers cannot receive their sign-in codes.**

**7. Log into your admin.** Go to `https://dallasbakery.net/admin`, sign in
with `sales@dallasbakery.com` and the temporary password from step 3. It will
make you choose a permanent password. Check that the "Launch connections"
panel shows everything active.

**8. The one test that matters.** Approve a test application for an email you
control, sign in as that buyer at `https://dallasbakery.net/order`, and place
a real card order (you can refund it from the admin afterwards). Confirm all
of these happen: the payment goes through → the order appears in the admin
shipping queue → you get the owner email → the buyer gets the confirmation
email → a UPS **test** label prints → "Mark shipped" sends the tracking email
→ tracking appears under My Orders. When all of that works, set
`UPS_ENVIRONMENT` to `production` and you are open for business.

## Part 3 — Managing the store day to day (no computer skills needed)

Everything happens at `https://dallasbakery.net/admin`:

- **Products** — add a bread, change a price or description, set each item's
  packed **box weight and size** (UPS buys labels from those exact numbers),
  hide an item, or delete it. Changes appear on the website and app instantly.
- **Approvals** — new wholesale applications wait here; approve or decline.
  Approved buyers can order immediately. Add extra delivery addresses for a
  multi-store business on its card.
- **Bake sheet** — each morning, how many cases of each bread to bake.
- **Shipping queue** — tick orders → Create labels → Print (thermal printer)
  → Mark shipped (buyers get tracking automatically). Refund a not-yet-shipped
  order from its row.
- **Case shipping** — the per-case shipping price buyers pay. Like every
  price, it shows only inside a signed-in buyer account — the public pages
  and the app's welcome screen never display a dollar figure.
- **Credit terms** — when you approve an account you'll be asked whether to
  give it a credit limit (you can also change it any time on the approved
  card). A buyer with credit checks out **on account by default** — they are
  never asked for a card. "Place order on account" is the main button on the
  website and in the app; "Pay by card instead" sits underneath for whoever
  prefers it, and a card is only *required* when an order is over their
  available credit. The order comes straight to your shipping queue tagged
  **ON ACCOUNT**, nothing is charged to a card, and you invoice them however
  you normally do. When they pay you, open the order in
  the queue and press **Mark invoice paid** — that frees up their credit for
  the next order. Unpaid account orders always count against the limit, and an
  order that would go over it is politely refused at checkout. Cancelling an
  un-shipped account order releases its amount instantly (no Stripe involved,
  since no card was charged).
- **Exclusive pricing** — on any approved buyer's card, open **Exclusive
  pricing** to give that business its own price per loaf on any bread. Each
  buyer's catalog simply shows their prices as *the* prices — nothing hints
  that anyone pays differently, and the list price never reaches their
  browser or phone. Only your admin shows the comparison. The special price
  follows them everywhere — website, app, standing weekly orders, and
  receipts. "Back to list price" removes it.

## Part 4 — The phone apps (do after the website works)

The apps talk to the website, so the website must be live first.

1. Create an **Expo** account (expo.dev, free) and install their build tool:
   `npm install -g eas-cli`, then `eas login`.
2. Create an **Apple Developer** account ($99/year, developer.apple.com — for
   a business this includes a D-U-N-S check that can take days) and a
   **Google Play Console** account ($25 once, play.google.com/console).
3. In Terminal, in the `buyer-mobile-app` folder:
   ```bash
   npm install
   eas build:configure
   ```
   In your Expo project settings (the EAS website), add two environment
   variables for the production profile:
   - `EXPO_PUBLIC_API_URL` = `https://dallasbakery.net`
   - `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` = your `pk_live_...` key
4. Build: `eas build --platform ios` and `eas build --platform android`.
   EAS walks you through the Apple/Google signing questions — accept the
   defaults.
5. **Test on a real phone before submitting**: `eas build --profile preview`,
   install it, and pay for one small order. The card sheet only works in these
   builds, never in a web preview.
6. Submit: `eas submit --platform ios` and `eas submit --platform android`.
   In App Store Connect, fill the listing (screenshots are in this package)
   and — important — give Apple's reviewer a **demo login**: approve a test
   application for an inbox you control and put that email in the review
   notes, explaining a sign-in code is emailed to it.
7. Repeat for `owner-mobile-app` if you want the approvals app on your phone
   (it only needs `EXPO_PUBLIC_API_URL`).

## If something breaks

- Buyers don't get codes → Resend domain not "Verified" (Part 2, step 6).
- Paid but no order in admin → webhook secret wrong or endpoint URL typo
  (Part 2, step 5).
- Labels fail → UPS credentials, or `UPS_ENVIRONMENT` still `test`.
- Card form doesn't load → `STRIPE_PUBLISHABLE_KEY` missing.

Each fix is: correct the secret, run `npm run deploy` again.
