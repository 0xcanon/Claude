/**
 * The privacy notice, wholesale terms, and support answers, as data.
 *
 * These live in the app rather than behind a link for two reasons. Apple
 * expects a customer to be able to read what an app does with their
 * information without leaving it, and a buyer standing in a kitchen with bad
 * signal should still be able to. The same words are published at
 * dallasbakery.net/privacy and /terms; when one changes, both change.
 *
 * Plain data with no React import, so the wording is unit-testable — an
 * out-of-date effective date or a section that stops mentioning something the
 * app actually collects is a real compliance problem, and a test can catch it.
 */

export const EFFECTIVE_DATE = "August 30, 2026";
export const SUPPORT_EMAIL = "sales@dallasbakery.com";
export const SUPPORT_PHONE = "(469) 729-4706";
export const SUPPORT_PHONE_DIAL = "+14697294706";
export const POSTAL_ADDRESS = "Dallas Bakery, 2643 Manana Dr, Dallas, TX 75220";
export const WEBSITE = "https://dallasbakery.net";

export type LegalSection = {
  heading: string;
  /** Paragraphs. Rendered in order. */
  body: string[];
  /** Optional bullet list shown under the paragraphs. */
  bullets?: string[];
};

export type LegalDocument = {
  key: "privacy" | "terms";
  title: string;
  intro: string;
  sections: LegalSection[];
  webUrl: string;
};

export const PRIVACY_NOTICE: LegalDocument = {
  key: "privacy",
  title: "Privacy notice",
  webUrl: `${WEBSITE}/privacy`,
  intro:
    "This explains what Dallas Bakery collects when you apply for or use a wholesale account, " +
    "what we do with it, and what you can ask us to do about it.",
  sections: [
    {
      heading: "What we collect",
      body: ["Everything here is information you give us, or that your order creates."],
      bullets: [
        "Your business: name, type, website, and the storefront and delivery addresses we ship to.",
        "Your contact: name, business email, and phone number.",
        "Your orders: what you ordered, when, where it shipped, the purchase-order reference and delivery day you chose, tracking numbers, and what you paid or owe.",
        "Your account terms: your credit limit and net terms, and any pricing set specifically for you.",
        "Payment: card payments are processed by Stripe. We never see or store your full card number — Stripe holds the saved card and gives us only a reference to it.",
        "Notifications: if you turn them on, the notification token your phone issues, so we can tell you when an order ships or an invoice is due.",
        "Email list: your address, only if you ticked the box asking us to email you about new breads or pricing.",
      ],
    },
    {
      heading: "What we do with it",
      body: [
        "We use it to check that a business qualifies for wholesale, to take and ship your orders, to invoice you and track what is owed, to answer your questions, and to keep the account secure.",
        "We do not sell your information, and we do not share it for anyone else's advertising.",
      ],
    },
    {
      heading: "Who else sees it",
      body: [
        "Only the companies that make an order happen, and only the part each one needs:",
      ],
      bullets: [
        "Stripe — payments and saved cards.",
        "UPS — the name, address, and phone on a shipping label.",
        "Our email provider — the messages we send you.",
        "Expo and Apple or Google — the delivery of a notification to your phone.",
        "Cloudflare — hosting the service and its database.",
      ],
    },
    {
      heading: "How long we keep it",
      body: [
        "Order and invoice records are kept as long as tax and accounting rules require, and that is not something we can shorten — a sale has to stay on the books.",
        "Everything else is kept while your account is open. When you close your account, we erase your business and contact details, saved addresses, saved card, standing order, exclusive pricing, notification devices, and email-list entry. Your past orders stay, because they are the sales record.",
      ],
    },
    {
      heading: "Your choices",
      body: [
        "You can close your account from Account → Close account in this app. It takes effect immediately and tells you exactly what is erased and what is kept before you confirm.",
        "You can turn notifications off in Account → Notifications, or in your phone's Settings, at any time.",
        "You can leave the email list with the unsubscribe link in any of those emails. That never stops order confirmations, tracking, or invoices — those are part of your order, not marketing.",
        `To see, correct, or ask a question about what we hold, email ${SUPPORT_EMAIL} or call ${SUPPORT_PHONE}.`,
      ],
    },
    {
      heading: "Security",
      body: [
        "Connections are encrypted, your sign-in session is stored in your phone's secure keystore, and access to the bakery's records is limited to the people who run it. No online system can be guaranteed completely secure, and we will tell you promptly if something goes wrong that affects you.",
      ],
    },
    {
      heading: "Children",
      body: [
        "This is a wholesale service for businesses. It is not directed to children and we do not knowingly collect information from anyone under 18.",
      ],
    },
    {
      heading: "Contact",
      body: [`${POSTAL_ADDRESS}`, `${SUPPORT_PHONE} · ${SUPPORT_EMAIL}`],
    },
  ],
};

export const WHOLESALE_TERMS: LegalDocument = {
  key: "terms",
  title: "Wholesale terms",
  webUrl: `${WEBSITE}/terms`,
  intro:
    "These terms cover applying for a Dallas Bakery wholesale account and ordering through it. " +
    "The prices and terms shown inside your approved account apply as well.",
  sections: [
    {
      heading: "Who can have an account",
      body: [
        "Wholesale is for commercial food businesses, hospitality operators, institutions, and food distributors. What you tell us must be accurate and authorised by the business. Applying does not guarantee approval, and we may close an account for inaccurate information, misuse, or nonpayment.",
      ],
    },
    {
      heading: "Where we deliver",
      body: [
        "We ship UPS Ground to approved business addresses in the contiguous United States. Additional locations can be added to your account once we have approved each one. We do not ship to Alaska, Hawaii, or U.S. territories.",
      ],
    },
    {
      heading: "Prices and orders",
      body: [
        "Wholesale prices are private to your account and may differ by product, quantity, and destination. Shipping is charged per case. Bakery items are not taxed in Texas.",
        "An order is accepted when it is confirmed in the app or in writing by Dallas Bakery. Orders placed before 12:00 PM Central on a business day are baked and shipped that day; later orders go out the next business day. A delivery day you choose is a request to the carrier, not a guarantee.",
      ],
    },
    {
      heading: "Paying",
      body: [
        "Orders are paid by card at checkout, or invoiced on account if we have put your business on Net 15 or Net 30 terms with a credit limit. An account balance may never exceed that limit, and while any invoice is past due, new orders must be paid by card until it is settled.",
      ],
    },
    {
      heading: "Standing weekly orders",
      body: [
        "You can set up a standing weekly order. It repeats on the weekday you choose and is charged to your saved card at current prices each week — there is no separate subscription fee, and the only thing you are charged for is the bread. You can pause it at any time from the app or the website, and pausing takes effect before the next run.",
      ],
    },
    {
      heading: "If something is wrong",
      body: [
        "Our bread has a 14-day shelf life at room temperature. If an order arrives late, short, or damaged, tell us within 7 days of delivery — or of the expected delivery date — and we will replace it or refund it. Call the bakery; that is always the fastest way.",
      ],
    },
    {
      heading: "Your account",
      body: [
        "Sign-in codes are sent to your business email. Keep access to that inbox secure and tell us promptly about any unauthorised use. You can close your account at any time from Account → Close account.",
      ],
    },
    {
      heading: "Questions",
      body: [`${SUPPORT_PHONE} · ${SUPPORT_EMAIL}`, POSTAL_ADDRESS],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalDocument["key"], LegalDocument> = {
  privacy: PRIVACY_NOTICE,
  terms: WHOLESALE_TERMS,
};

export type SupportTopic = {
  question: string;
  answer: string;
};

/**
 * The questions the bakery actually gets asked. Answered here so a buyer can
 * solve their own problem at 6am, and so a reviewer opening the app cold can
 * see what it does without an account.
 */
export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    question: "How do I get a wholesale account?",
    answer:
      "Tap Apply for wholesale on the opening screen and tell us about your business. We check that it is a commercial food business and usually reply within one business day. Once you are approved, sign in with your business email — we send a six-digit code, so there is no password to remember.",
  },
  {
    question: "Why can't I see prices?",
    answer:
      "Wholesale pricing is private to each account. Prices appear as soon as you sign in to an approved account, and what you see is your price — there is no separate list to compare against.",
  },
  {
    question: "How much bread is in a case, and what is the minimum?",
    answer:
      "A case is 25 loaves. One case is the minimum order. Each case ships as its own box, and the shipping cost is shown before you pay.",
  },
  {
    question: "When will my order arrive?",
    answer:
      "Order before 12:00 PM Central on a business day and it is baked and shipped that day; later orders go out the next business day. UPS Ground takes 1–4 business days from there. You can ask for a specific delivery day at checkout, and tracking is emailed and pushed to you when the box leaves.",
  },
  {
    question: "What is in the bread, and what are the allergens?",
    answer:
      "Every product page carries the full ingredient statement, the contains line, net weight, shelf life, storage, and certifications — the same words as the printed bag. Our breads contain wheat; some contain sesame, and all are made in a bakery that handles sesame.",
  },
  {
    question: "Can I pay on account instead of by card?",
    answer:
      "If we have put your business on Net 15 or Net 30 terms, on-account is your default at checkout and no card is asked for. Your invoices and a full account statement are in Account → Invoices and statements, ready to print or save as a PDF.",
  },
  {
    question: "How do I add a purchase-order number?",
    answer:
      "There is a PO number field on the cart screen, just above the checkout button. It prints on your invoice and on the packing slip.",
  },
  {
    question: "Can I set up a repeating order?",
    answer:
      "Yes. Fill the cart, then choose a weekday under Standing weekly order. It repeats every week at current prices, charged to your saved card, and you can pause it any time. There is no subscription fee — you pay for the bread only.",
  },
  {
    question: "Something arrived damaged or late.",
    answer:
      "Call the bakery within 7 days of delivery and we will replace it or refund it. Calling is faster than email for anything to do with a box that has already shipped.",
  },
  {
    question: "How do I turn notifications off?",
    answer:
      "Account → Notifications, or your phone's Settings. Order confirmations and invoices still reach you by email either way.",
  },
  {
    question: "How do I close my account?",
    answer:
      "Account → Close account. It takes effect immediately and shows you exactly what gets erased and what we have to keep before you confirm.",
  },
];
