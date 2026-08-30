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
  Each bread also carries its **label copy** — ingredients, the "contains"
  allergen line, net weight, shelf life, storage, certifications. Copy it word
  for word off the bag: a chef building an allergen matrix will rely on it,
  and so will their health inspector.
- **Ran out of something?** Press **Mark sold out** on that bread. Buyers
  still see it, marked sold out, and can't order it; one click puts it back
  tomorrow. That's different from **Hide**, which retires a product. You can
  also set **cases you can bake in a day** — the site counts today's orders
  and stops selling once the ovens are committed — and a **most cases in one
  order** cap. Leave either at 0 for no limit.
- **Approvals** — new wholesale applications wait here; approve or decline.
  Approved buyers can order immediately. Add extra delivery addresses for a
  multi-store business on its card.
- **Bake sheet** — each morning, how many cases of each bread to bake.
- **PO numbers and delivery days** — buyers can attach their own purchase-order
  reference and ask for a delivery day at checkout. Both are optional. The PO
  shows on the shipping-queue row and prints on the invoice; the requested day
  shows as "Wants Sep 3" so you know what to pack first. The day they pick can
  only ever be one UPS Ground can actually reach — the site works that out
  from your noon cutoff.
- **Invoices and statements** — every order has a printable invoice: open it
  from the Money panel of any order in the shipping queue, then print it or
  save it as a PDF to email. Buyers can open their own invoices and a full
  account statement (everything still owed, aged into current / 1–30 / 31–60 /
  61+ days) from their account on the website or in the app — so you're not
  the one assembling statements at month end.
- **Shipping queue** — tick orders → Create labels → Print (thermal printer)
  → Mark shipped (buyers get tracking automatically). Refund a not-yet-shipped
  order from its row.
- **Case shipping** — the per-case shipping price buyers pay. Like every
  price, it shows only inside a signed-in buyer account — the public pages
  and the app's welcome screen never display a dollar figure.
- **Net terms** — Net 15 / Net 30 is the account, and it's only for the
  customers you choose. When you approve an application you're asked whether
  to put the business on Net 15, Net 30, or keep it card-only; if you pick
  terms, you set their **net limit** — the most they can owe at once. You
  can also set all of this on a *pending* application (it goes live the
  moment you approve) or change it any time in the **Net terms** box on
  their card. A buyer on terms checks out on account by default — never
  asked for a card — with "Pay by card instead" underneath. Every account
  order stamps its invoice due date (order date + 15 or 30 days); the
  shipping queue shows it and turns red **OVERDUE** when the date passes
  unpaid. **The moment anything is past due, their account locks**: the
  buyer sees a past-due notice everywhere and every new order must be paid
  by card, until you press **Mark invoice paid** on the overdue orders in
  the shipping queue — that's how you record that their net balance was
  settled, and their account reopens instantly. The balance can never pass
  the net limit, and cancelling an un-shipped account order releases its
  amount (no Stripe involved, since no card was charged).
- **Exclusive pricing** — on any approved buyer's card, open **Exclusive
  pricing** to give that business its own price per loaf on any bread. Each
  buyer's catalog simply shows their prices as *the* prices — nothing hints
  that anyone pays differently, and the list price never reaches their
  browser or phone. Only your admin shows the comparison. The special price
  follows them everywhere — website, app, standing weekly orders, and
  receipts. "Back to list price" removes it.

- **Email list & notifications** — buyers opt in with a box on the wholesale
  application (unchecked by default), or you add someone who asked in person.
  Write a subject and a message, press **Send test to me** to see exactly what
  they'll get, then send it to the list. Every message automatically carries
  the bakery's address and a working one-click unsubscribe, which the law
  requires — and unsubscribing never stops order confirmations, tracking, or
  invoices. This panel also shows how many phones are set up for push alerts.
- **Push alerts** — once the apps are installed, buyers get a notification
  when their order is received, when it ships (with tracking), and before an
  invoice comes due; you get one for every new order with the business, case
  count, and amount. Buyer notifications never show a price — a lock screen is
  read by whoever is holding the phone, and your pricing is per customer.

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

   **For push notifications**, also run `eas init` in this folder once — it
   records the project id the app needs to receive them. (You can skip it;
   the app works fine and buyers still get email, they just won't get
   notifications.) Optionally set `EXPO_ACCESS_TOKEN` as a Worker secret to
   require a signed sender once you're in the stores.
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
