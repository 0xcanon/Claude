# Food, tax, and legal sign-off

Software cannot answer any of the questions on this page. They are decisions
about the bakery — what its licence covers, what its labels say, whether it
charges sales tax — and each one needs a person who is accountable for it.

Print this, fill it in, and keep it. If a health inspector, an auditor, or a
lawyer ever asks, this page is the answer, and the date beside each line is
the evidence that somebody actually looked.

Nothing here is legal or tax advice. Where a line says "confirmed by", it
means confirmed by someone qualified to confirm it, not by reading a website.

---

## 1. Food safety and labelling

| # | What has to be true | Confirmed by | Date | Notes |
| --- | --- | --- | --- | --- |
| 1.1 | The bakery holds a current Texas food establishment permit covering **wholesale** production, not only retail sale. | | | |
| 1.2 | The most recent health inspection is on file and its findings are closed out. | | | |
| 1.3 | Every product sold wholesale carries a compliant label: statement of identity, net quantity, ingredient list in descending order by weight, allergen declaration, and the bakery's name and address. | | | |
| 1.4 | The allergen text shown on the website and in the apps matches the physical label on the bag, word for word. | | | |
| 1.5 | The ingredient list in `/admin` → Products matches the current recipe, including any change of supplier. | | | |
| 1.6 | Kosher and Halal claims, where made, are backed by a current certificate from the certifying body. | | | |
| 1.7 | The shelf life stated to buyers (14 days) is supported by the bakery's own testing or supplier data. | | | |
| 1.8 | Somebody is responsible for updating 1.3–1.7 when a recipe changes, and knows they are. | | | |

**A recall.** If a batch has to be pulled: `/admin` → shipping queue → filter
**All**, and every order carries the buyer, the date, and what was in it.
Export the CSV, and call the affected buyers before you email them.

---

## 2. Sales tax

| # | What has to be true | Confirmed by | Date | Notes |
| --- | --- | --- | --- | --- |
| 2.1 | A tax professional has advised whether Texas sales tax applies to these wholesale sales, and the answer is written down. | | | |
| 2.2 | If sales are exempt as sales for resale, a signed Texas resale certificate is on file **for every wholesale buyer**, and the file is checked when an account is approved. | | | |
| 2.3 | If tax does apply, the rate and how it is collected have been decided, and the site has been changed to collect it. **The system as shipped does not calculate or collect sales tax.** | | | |
| 2.4 | Economic nexus in other states has been reviewed against where orders are actually shipping. | | | |
| 2.5 | The filing calendar is known and somebody owns it. | | | |

> **Read 2.3 twice.** Prices are exclusive of tax and no tax line is added at
> checkout. If tax turns out to be due, that is a change to make before
> launch, not after.

---

## 3. Terms, privacy, and payments

| # | What has to be true | Confirmed by | Date | Notes |
| --- | --- | --- | --- | --- |
| 3.1 | The wholesale terms at `/terms` have been read by a lawyer and describe what this business actually does. | | | |
| 3.2 | The privacy notice at `/privacy` lists every place customer data goes: Stripe, UPS, the email provider, Cloudflare, and Expo's push service. | | | |
| 3.3 | The Net 15 / Net 30 credit terms, and what happens when an invoice is late, are in the written terms and match what the software does. | | | |
| 3.4 | The refund and cancellation practice matches what the terms promise. | | | |
| 3.5 | The Stripe account is a business account in the bakery's legal name, with the right bank account attached. | | | |
| 3.6 | Somebody knows how to respond to a Stripe dispute, and knows the order history in `/admin` is the evidence. | | | |
| 3.7 | Card data never touches this system — it goes to Stripe directly from the browser or app — and no PCI questionnaire beyond SAQ-A is needed. | | | |

---

## 4. Insurance and the business itself

| # | What has to be true | Confirmed by | Date | Notes |
| --- | --- | --- | --- | --- |
| 4.1 | Product liability insurance is in force and its limit is appropriate for wholesale volume. | | | |
| 4.2 | General liability and commercial property cover are current. | | | |
| 4.3 | The insurer knows the bakery now sells wholesale. A retail-only policy may not cover it. | | | |
| 4.4 | Any buyer requiring a certificate of insurance has been given one. | | | |

---

## Sign-off

The lines above are true as of the date below, and the evidence for each is
where the notes column says it is.

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Owner | | | |
| Food safety | | | |
| Accountant / tax | | | |
| Legal | | | |

Review this page again whenever a recipe changes, a new state is shipped to,
or the terms are amended — and at least once a year regardless.
