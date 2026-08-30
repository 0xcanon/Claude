# v22 — The pages Apple needs before it will approve the app

Everything here exists for one reason: to get the buyer app through App
Review. The requirements were researched against the live App Store Review
Guidelines, each candidate finding was adversarially checked before anything
was built, and the whole flow was then verified against a running site.

Verified live: a reviewer signing in with the demo credentials on a database
where the account did not yet exist, placing a real order on account, deleting
the account, having their session die on the very next request, and the next
reviewer signing straight back in to a rebuilt account. 150 automated tests,
lint, typecheck, a production build, and all 16 migrations from empty.

## The one that would have failed the submission

**App Review could not sign in.** The whole app is behind a six-digit code
emailed to an approved business, and a reviewer cannot read that inbox. They
would have seen a sign-in wall and rejected the app under guideline 2.1 —
comfortably the most likely way this submission fails.

There is now a review account, behind two secrets the owner sets
(`REVIEW_DEMO_EMAIL`, `REVIEW_DEMO_CODE`). That pair signs in. Three things
make it hold up:

- **It builds itself.** The account does not have to exist first; the first
  sign-in creates it — approved, on Net 15 terms with a $5,000 limit, with two
  delivery addresses — so every screen has something in it.
- **It survives being deleted.** A reviewer testing account deletion will
  delete this account, which is the feature working correctly. The next
  sign-in rebuilds it. Nothing to reset between submissions.
- **It is inert without its secrets.** No demo email is recognised, no account
  is created, sign-in behaves exactly as before. Verified by removing them and
  re-testing.

The net terms are deliberate: the reviewer can complete a real order end to
end with no card charged and no test card that might decline.

## Account deletion (guideline 5.1.1(v))

Apple requires any app supporting account creation to offer deletion inside
the app. There was none. Now: **Account → Delete account.**

It does the honest version of deletion. Erased: business and contact details,
saved delivery addresses, the saved card (deleted at Stripe too, not just
here), sign-in codes, the standing weekly order, exclusive pricing,
notification devices, and the email-list entry. Kept: past orders with the
name and address each shipped to, because sales records are required for tax
and accounting and cannot be deleted.

The screen says which is which *before* the buyer confirms, with counts from
their actual account. An unpaid balance is shown first, in red, with a call
button — deleting does not cancel a debt, and pretending otherwise would be
dishonest. Confirmation needs the word DELETE typed, so a mis-tap cannot do
it. Afterwards a receipt screen repeats what was kept, and both the buyer and
the owner get an email.

Deletion is deliberately **not** blocked by an unpaid invoice. A buyer is
entitled to leave whether or not they owe money; refusing until they pay would
turn a privacy right into a collections lever. The debt survives in the order
records and the owner is told.

The session dies instantly. Sessions are signed rather than stored, so there
is no row to delete — instead every buyer lookup now excludes closed accounts,
which was verified: a still-valid token returns 403 on the next request.

## Pages a reviewer can reach without an account

Reachable from the opening screen, before any sign-in:

- **Help & contact** — a phone button first, because for anything about a box
  that already shipped that is the only answer that helps today; then email,
  then the eleven questions the bakery actually gets asked.
- **Privacy notice** — rewritten and now accurate: it names the push token,
  the marketing list, Stripe, UPS, what is kept when an account closes and
  why, and how to leave.
- **Wholesale terms** — including an explicit section on standing weekly
  orders and what a recurring charge means.
- **About** — who the bakery is, contact details, version, legal links.

## Notification settings (guideline 4.5.4)

**Account → Notifications**, with two real switches: order updates, and
invoice reminders. Turning one off is stored server-side against that device,
because that is where the decision to send is made — a preference living only
on the phone could not stop a push already on its way.

Permission is asked from this screen rather than at launch, so the prompt
arrives when the buyer has gone looking for it. The screen states plainly that
the app works with notifications off, and that nothing we send is marketing.

## Things a reviewer would have noticed

- **A dead primary button.** "Request another location" opened a `mailto:`,
  which does nothing on a device with no mail account — which is exactly the
  review device. It now opens Help, where the phone button works.
- **A dead avatar** on the Account screen that navigated nowhere. Removed.
- **Text at 6–8pt** — 127 instances across both apps, below any reasonable
  legibility floor and a real finding under guideline 4.0. Nothing is now
  under 9pt.
- **Recurring-charge consent.** "MAKE IT WEEKLY" did not say what would
  happen. It now states the terms above the button — repeats every chosen
  weekday until paused, charged to the saved card at that week's prices, no
  subscription fee — and the button says "Start weekly order".

## Metadata and manifests

- **`PrivacyInfo.xcprivacy`** now ships, declaring the data collected and the
  required-reason APIs. Without it App Store Connect warns at upload and
  eventually refuses the build.
- **`APP_STORE_SUBMISSION.md`** is new: the reviewer notes to paste, the
  App Privacy label answers, the listing fields, and a five-step pre-flight.

## The owner app cannot go on the public App Store

It is a staff tool for one company — approvals, shipping settings, order
alerts. Apple rejects single-company internal apps from public distribution.
The three legitimate routes (Custom App via Apple Business Manager,
TestFlight, or just using `/admin` in a browser) are laid out in
`APP_STORE_SUBMISSION.md`. The buyer app has none of this problem.

## Database

One migration, `0015_account_closure.sql`: `closed_at` and `closed_reason` on
`wholesale_applications`, and `order_updates` / `invoice_reminders` on
`push_devices`.
