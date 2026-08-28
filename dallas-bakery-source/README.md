# Dallas Bakery Wholesale — Launch Source v14

This package contains the complete Dallas Bakery wholesale customer experience and owner tools. v14 closes every finding from the v13 end-to-end audit — see `CHANGES-v14.md` for the item-by-item list.

## Included projects

- `wholesale-site/` — responsive wholesale website, application flow, branded owner portal, approval APIs, live shipping settings, address/category screening, private B2B account setup, legal pages, and database migrations.
- `buyer-mobile-app/` — real native iPhone/Android customer app. Buyers can apply, track approval, sign in securely, select among approved locations, see location-specific private pricing, order, check shipping, and review order history.
- `owner-mobile-app/` — separate native iPhone/Android app for Dallas Bakery. The owner can review applications, approve or decline buyers, retry account setup, add notes, and change the live box-shipping rate.

Customer and owner sign-in are intentionally separate. Customer-facing screens and labels show Dallas Bakery branding only.

## Current business rules

- Wholesale bread price: **$2.50 per unit**
- Shelf life: **14 days**
- Weekly production capacity: **unlimited**
- Certifications: **Kosher and Halal**
- Shipping: **$12.50 per box of up to 25 units**, rounded up for partial boxes
- Owner email: **sales@dallasbakery.com**
- Production domain: **dallasbakery.net**
- Notification email sends **from the wholesale domain** (e.g. `wholesale@dallasbakery.net`) with replies routed to `sales@dallasbakery.com`. The owner is emailed on every new application; applicants are emailed on approval and decline.

The owner can change the shipping rate and units per box from the branded admin website or owner app. The website and buyer app read that setting live. The checkout rate callback uses the same setting.

## Verification completed

- Wholesale site: 16 automated unit tests pass, including the new email-notification suite. Database migrations were re-applied to a fresh database and match the schema exactly.
- Buyer app: 3 automated tests pass.
- Owner app: 3 automated tests pass.
- v13's production build, lint, strict TypeScript, and Metro exports passed before the v14 changes; those checks must be re-run with dependencies installed (`npm run verify` in each project) as the first step of the launch checklist.

These checks verify the source. Production credentials, the final store catalog, domain DNS, mail-domain DNS (SPF/DKIM/DMARC on dallasbakery.net), signed Apple/Google builds, and real checkout transactions still require Dallas Bakery's accounts and must be completed before public launch.

## Start here

1. Follow `LAUNCH_CHECKLIST.md` in this folder.
2. Follow `wholesale-site/README.md` for the hosted site, the Stripe keys, and the order webhook.
3. Follow `buyer-mobile-app/README.md` for the customer app.
4. Follow `owner-mobile-app/README.md` for the owner app.

No production passwords, API keys, tokens, or signing credentials are included in this archive.
