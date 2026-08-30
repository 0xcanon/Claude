# Submitting the apps

Everything App Review needs, in the order you'll need it. Read the first
section before you do anything else — it is the one that decides whether the
buyer app gets approved or bounced.

---

## 1. The reviewer has to be able to sign in (do this first)

The buyer app is entirely behind a sign-in, and the code goes to a business
email address. **An App Review reviewer cannot read that inbox.** If they
open the app, tap "I already have an account", and can't get past it, the app
is rejected under guideline 2.1 — and that is the single most common way an
app like this fails.

So the app has a review account. Set two secrets on the website:

```bash
cd wholesale-site
npx wrangler secret put REVIEW_DEMO_EMAIL     # e.g. appreview@dallasbakery.com
npx wrangler secret put REVIEW_DEMO_CODE      # six digits you choose, e.g. 314159
```

That email plus that code signs in. You do not need to create the account —
the site builds it the first time it is used: approved, on Net 15 terms with
a $5,000 limit, and with two delivery addresses. Because it is on net terms,
**the reviewer can place a real order end to end without a card being
charged**, which is exactly what you want them to be able to test.

It also repairs itself. A reviewer testing "Delete account" will delete this
account — which is the feature working correctly — and the next sign-in
simply rebuilds it. There is nothing to reset between submissions.

If either secret is unset the whole mechanism is inert and sign-in behaves
normally, so nothing changes for real buyers.

**In App Store Connect → App Review Information:**

- Tick **Sign-in required**
- Username: the `REVIEW_DEMO_EMAIL` you set
- Password: the `REVIEW_DEMO_CODE` you set
- Contact: your name, `sales@dallasbakery.com`, `(469) 729-4706` — Apple
  phones this if sign-in fails, so it must be a number you answer.

**Notes to the reviewer** — paste this in:

> Dallas Bakery Wholesale is a business-to-business ordering app for a real
> bakery in Dallas, Texas. We sell Persian barbari bread by the case to
> restaurants, grocers, hotels, and food distributors, and ship it by UPS.
>
> ACCOUNTS ARE APPROVED BY US, NOT SELF-SERVE. A business applies from the
> opening screen, we verify it is a genuine commercial food business, and we
> approve it. Sign-in is then an emailed six-digit code — there is no
> password. The demo credentials in the fields above are a standing review
> account; enter the email, tap Send code, then enter the six-digit code from
> the Password field (you will not need to check an inbox).
>
> PRICES APPEAR ONLY AFTER SIGN-IN. Wholesale pricing is negotiated per
> customer, so no price is shown on any public screen. This is deliberate and
> is how the trade works; after signing in with the demo account the full
> catalog with prices is visible.
>
> PAYMENT IS FOR PHYSICAL GOODS (bread, shipped by UPS), so it uses Stripe
> rather than in-app purchase, per guideline 3.1.3(e). The demo account is on
> Net 15 terms, so you can complete a real order using "Place order on
> account" without any card being charged. "Pay by card instead" opens the
> Stripe sheet if you would like to see it.
>
> ACCOUNT DELETION is at Account → Delete account. It works fully on the demo
> account; the account rebuilds itself for the next reviewer.
>
> WITHOUT SIGNING IN you can still reach Help & contact, About, the Privacy
> notice and the Wholesale terms from the opening screen.
>
> Questions: (469) 729-4706, sales@dallasbakery.com.

---

## 2. What we added so the app passes review

| Guideline | What it requires | Where it is |
| --- | --- | --- |
| 5.1.1(v) | In-app account deletion | Account → **Delete account** |
| 5.1.1(i) | Privacy policy readable in the app | Opening screen and Account → Privacy notice |
| 1.5 | Contact information in the app | Help & contact — a phone button first |
| 4.5.4 | Push optional, no marketing, opt-out | Account → Notifications |
| 2.3.1 | Recurring charges disclosed before consent | The standing-order card states the terms above the button |
| 4.0 | Legible text | No text below 9pt anywhere in either app |
| 2.1 | Nothing broken or dead | The two dead controls were removed/rewired |

**About account deletion.** It really deletes: business and contact details,
saved addresses, the saved card (removed at Stripe too), the standing order,
exclusive pricing, notification devices, and the email-list entry. Past
orders stay, because sales records are required for tax and accounting — the
screen says exactly that before you confirm, and again afterwards. An unpaid
balance is shown in red first; deleting does not cancel it, and we say so.

---

## 3. App Store Connect listing fields

These are required and the app cannot be published without them:

- **Support URL** — `https://dallasbakery.net` (the site has the phone number
  and email on every page)
- **Privacy Policy URL** — `https://dallasbakery.net/privacy`
- **Copyright** — `2026 Dallas Bakery`
- **Age rating** — complete the questionnaire; answer "None" to everything.
  The app has no objectionable content. It rates 4+.
- **App Privacy** ("nutrition labels") — declare these, all *linked to the
  user*, all *App Functionality*, and **none used for tracking**:
  - Contact Info: Name, Email Address, Phone Number, Physical Address
  - Purchases: Purchase History
  - Identifiers: Device ID (the notification token, only if they turn
    notifications on)
  - Do **not** declare payment info — Stripe collects the card directly and
    it never reaches the app.
- **Export compliance** — already answered in the app config: uses only
  standard HTTPS, exempt.

The matching iOS privacy manifest ships in `app.config.ts` and is written to
`PrivacyInfo.xcprivacy` at build time. You don't have to do anything with it.

---

## 4. The owner app is a different problem — read this

**The owner app will be rejected from the public App Store.** It is a staff
tool for one company: approving wholesale applications, changing shipping
settings, getting new-order alerts. Apple rejects single-company internal
apps from public distribution — there is nothing a member of the public could
do with it.

You have three legitimate routes. Pick one:

1. **Custom App via Apple Business Manager** (recommended). Free, and the
   correct route for exactly this. Enrol at business.apple.com, then in App
   Store Connect set the app's distribution to *Custom App* and assign it to
   your own organisation. It is not listed publicly and only your staff can
   install it.
2. **TestFlight only.** Simplest if it is just you and a couple of people.
   Builds last 90 days and you re-upload; no App Store review of the listing
   is involved beyond TestFlight's lighter check.
3. **Don't ship it.** The admin portal at `dallasbakery.net/admin` does
   everything the owner app does and works fine on a phone browser.

The buyer app has none of this problem — it is used by many different
businesses, which is exactly what public distribution is for.

---

## 5. Before every submission

Two minutes, and it catches the things that actually get apps rejected:

1. Install the build on a real phone and **sign in with the demo
   credentials**. If that fails, nothing else matters.
2. Place an order on account, and open an invoice.
3. Open Account → Delete account, and confirm it. Then sign in again — the
   account should rebuild itself.
4. Check that Help & contact, About, Privacy and Terms all open from the
   opening screen, before signing in.
5. Confirm the website is up. Apple reviews from their own network, and an
   app whose backend is down reads as a broken app.
