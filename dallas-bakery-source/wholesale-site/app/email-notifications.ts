/**
 * Transactional email for wholesale applications.
 *
 * Sends from the wholesale domain (dallasbakery.net) with replies routed to
 * the monitored owner mailbox. Delivery is best-effort: a mail failure must
 * never block an application, an approval, or a decline. When MAIL_* settings
 * are absent every send becomes a no-op and the admin dashboard shows the
 * connection as inactive.
 *
 * The transport is a single JSON POST compatible with Resend's /emails
 * endpoint. Point MAIL_API_URL at another provider's compatible endpoint if
 * Dallas Bakery prefers a different sender.
 */

// .ts extension keeps this resolvable by the plain node test runner;
// the project enables allowImportingTsExtensions, so the build is unaffected.
import { orderRulesLines } from "./order-rules.ts";

const DEFAULT_MAIL_API_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;
const OWNER_PORTAL_URL = "https://dallasbakery.net/admin";
const SUPPORT_EMAIL = "sales@dallasbakery.com";
const SUPPORT_PHONE = "(469) 729-4706";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

type ApplicationForEmail = {
  id: string;
  businessName: string;
  businessType: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
};

function mailApiKey() {
  return String(process.env.MAIL_API_KEY || "").trim();
}

function mailFrom() {
  return String(process.env.MAIL_FROM || "").trim();
}

function mailReplyTo() {
  return String(process.env.MAIL_REPLY_TO || "").trim();
}

export function mailConfigured() {
  return Boolean(mailApiKey() && mailFrom());
}

export function ownerNotificationAddress() {
  return String(process.env.MAIL_OWNER_TO || process.env.ADMIN_LOGIN_EMAIL || "")
    .trim()
    .toLowerCase();
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function newApplicationOwnerEmail(
  application: ApplicationForEmail,
  options: { screeningStatus: string },
): MailMessage {
  const needsReview = options.screeningStatus !== "auto_matched";
  return {
    to: ownerNotificationAddress(),
    subject: `New wholesale application — ${application.businessName}`,
    text: [
      `A new wholesale application just arrived.`,
      ``,
      `Business: ${application.businessName} (${application.businessType})`,
      `Contact: ${application.contactName} · ${application.email} · ${application.phone}`,
      `Location: ${application.city}, ${application.state}`,
      `Screening: ${needsReview ? "needs your review" : "matched automatically"}`,
      ``,
      `Review and decide: ${OWNER_PORTAL_URL}`,
      `You can also approve or decline from the Dallas Bakery Owner app.`,
    ].join("\n"),
  };
}

export function applicantDecisionEmail(
  application: ApplicationForEmail,
  decision: "approved" | "declined",
  options: { orderingReady: boolean; portalUrl: string | null },
): MailMessage {
  if (decision === "approved") {
    const orderingLines = options.orderingReady && options.portalUrl
      ? [
          `Your private catalog is ready. Sign in with this email address — a six-digit code is sent to it each time:`,
          options.portalUrl,
        ]
      : [
          `We're finishing your ordering setup now and will send your sign-in link as soon as it's ready.`,
        ];
    return {
      to: application.email,
      subject: "Your Dallas Bakery wholesale account is approved",
      text: [
        `Hi ${firstName(application.contactName)},`,
        ``,
        `Good news — the wholesale account for ${application.businessName} is approved.`,
        ``,
        ...orderingLines,
        ``,
        `How ordering works:`,
        ...orderRulesLines().map((line) => `• ${line}`),
        ``,
        `If you applied from the Dallas Bakery Wholesale app, your status there updates automatically.`,
        ``,
        `Questions? Reply to this email or reach us at ${SUPPORT_EMAIL} · ${SUPPORT_PHONE}.`,
        ``,
        `— Dallas Bakery Wholesale`,
      ].join("\n"),
    };
  }

  return {
    to: application.email,
    subject: "About your Dallas Bakery wholesale application",
    text: [
      `Hi ${firstName(application.contactName)},`,
      ``,
      `Thank you for your interest in Dallas Bakery wholesale. After reviewing the application for ${application.businessName}, we aren't able to open a wholesale account for this business right now.`,
      ``,
      `If any of the business details have changed, or you think we're missing something, reply to this email or reach us at ${SUPPORT_EMAIL} · ${SUPPORT_PHONE} and we'll take another look.`,
      ``,
      `— Dallas Bakery Wholesale`,
    ].join("\n"),
  };
}

export function orderingReadyEmail(
  application: ApplicationForEmail,
  portalUrl: string | null,
): MailMessage {
  const signInLines = portalUrl
    ? [
        `Sign in with this email address — a six-digit code is sent to it each time:`,
        portalUrl,
      ]
    : [
        `Sign in from the Dallas Bakery Wholesale app with this email address to see your private catalog.`,
      ];
  return {
    to: application.email,
    subject: "Your Dallas Bakery wholesale ordering is ready",
    text: [
      `Hi ${firstName(application.contactName)},`,
      ``,
      `The ordering setup for ${application.businessName} is complete.`,
      ``,
      ...signInLines,
      ``,
      `How ordering works:`,
      ...orderRulesLines().map((line) => `• ${line}`),
      ``,
      `Questions? Reply to this email or reach us at ${SUPPORT_EMAIL} · ${SUPPORT_PHONE}.`,
      ``,
      `— Dallas Bakery Wholesale`,
    ].join("\n"),
  };
}

/**
 * Sends one message. Returns true only when the provider accepted it.
 * Never throws: notification failures are logged and swallowed so the
 * application flow that triggered them always completes.
 */
export async function sendMail(message: MailMessage) {
  if (!mailConfigured() || !message.to) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const response = await fetch(String(process.env.MAIL_API_URL || DEFAULT_MAIL_API_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${mailApiKey()}`,
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [message.to],
        ...(mailReplyTo() ? { reply_to: mailReplyTo() } : {}),
        subject: message.subject,
        text: message.text,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`Mail send failed with HTTP ${response.status} for "${message.subject}".`);
    }
    return response.ok;
  } catch (caught) {
    console.error("Mail send failed:", caught instanceof Error ? caught.message : caught);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function trackingEmail(order: {
  channel: string;
  orderNumber: number;
  customerName: string;
  email: string;
  trackingNumber: string;
}): MailMessage {
  const isWholesale = order.channel === "wholesale";
  return {
    to: order.email,
    subject: `Your Dallas Bakery order #${order.orderNumber} has shipped`,
    text: [
      `Hi ${firstName(order.customerName)},`,
      ``,
      `Order #${order.orderNumber} is on its way.`,
      ``,
      `UPS tracking: ${order.trackingNumber}`,
      `Track it: https://www.ups.com/track?tracknum=${order.trackingNumber}`,
      ``,
      `Most orders arrive within 1-4 business days. The bread keeps for 14 days at room temperature, no refrigeration needed.`,
      ``,
      isWholesale
        ? `Questions about this delivery? Reply to this email or reach us at ${SUPPORT_EMAIL} - ${SUPPORT_PHONE}.`
        : `Questions? Reply to this email or reach us at ${SUPPORT_EMAIL} - ${SUPPORT_PHONE}.`,
      ``,
      `- Dallas Bakery`,
    ].join("\n"),
  };
}

export function buyerCodeEmail(
  buyer: { businessName: string; contactName: string; email: string },
  code: string,
): MailMessage {
  return {
    to: buyer.email,
    subject: `${code} is your Dallas Bakery sign-in code`,
    text: [
      `Hi ${firstName(buyer.contactName)},`,
      ``,
      `Your sign-in code for the ${buyer.businessName} wholesale account:`,
      ``,
      `    ${code}`,
      ``,
      `It expires in 15 minutes and can only be used once. If you didn't ask to sign in, you can ignore this email — nobody can reach your account without this code.`,
      ``,
      `- Dallas Bakery Wholesale`,
    ].join("\n"),
  };
}

type OrderEmailInput = {
  channel: string;
  orderNumber: number;
  customerName: string;
  email: string;
  city: string;
  state: string;
  items: { name: string; quantity: number }[];
  caseCount: number;
  boxCount: number;
  loafCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shipsToday: boolean;
  /** "account" was placed on credit and will be invoiced; default is card. */
  paymentTerms?: "card" | "account";
  /** "Net 15" / "Net 30" for account orders with terms; empty otherwise. */
  termsLabel?: string;
  /** Account orders: the invoice due date (YYYY-MM-DD). */
  invoiceDueAt?: string;
};

function dueWording(order: Pick<OrderEmailInput, "termsLabel" | "invoiceDueAt">) {
  if (!order.invoiceDueAt) return "";
  return order.termsLabel
    ? ` (${order.termsLabel} — due ${order.invoiceDueAt})`
    : ` (due ${order.invoiceDueAt})`;
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function orderLines(order: OrderEmailInput) {
  return order.items.map((item) =>
    `  ${item.quantity} x ${item.name}`,
  );
}

/**
 * Tells the owner an order landed the moment it is recorded. With a noon
 * Central cutoff, an order nobody notices ships a day late — this is the
 * nudge that keeps that from happening without anyone watching /admin.
 */
export function ownerNewOrderEmail(order: OrderEmailInput): MailMessage {
  const wholesale = order.channel === "wholesale";
  const onAccount = order.paymentTerms === "account";
  return {
    to: ownerNotificationAddress(),
    subject: `${wholesale ? "Wholesale" : "Retail"} order #${order.orderNumber} — ${
      wholesale ? `${order.caseCount} case${order.caseCount === 1 ? "" : "s"}` : `${order.loafCount} loaves`
    }, ${dollars(order.totalCents)}${onAccount ? " ON ACCOUNT" : ""}${order.shipsToday ? " — ships today" : ""}`,
    text: [
      onAccount
        ? `New wholesale order ON ACCOUNT${dueWording(order)} — no card was charged; it counts against the buyer's credit until you mark the invoice paid in /admin.`
        : `New paid ${wholesale ? "wholesale" : "retail"} order.`,
      ``,
      `Order #${order.orderNumber} — ${order.customerName || order.email}`,
      `${order.city}, ${order.state}`,
      ``,
      ...orderLines(order),
      ``,
      `${order.boxCount} box${order.boxCount === 1 ? "" : "es"} · ${order.loafCount} loaves`,
      `Subtotal ${dollars(order.subtotalCents)} · Shipping ${dollars(order.shippingCents)} · ${onAccount ? "To invoice" : "Charged"} ${dollars(order.totalCents)}`,
      ``,
      order.shipsToday
        ? `Placed before the cutoff — this bakes and ships today.`
        : `Placed after the cutoff — bakes and ships the next business day.`,
      ``,
      `Labels and packing: https://dallasbakery.net/admin`,
    ].join("\n"),
  };
}

/**
 * The buyer's branded confirmation, sent when the order is recorded. Stripe's
 * receipt proves the charge; this one says what was ordered and what happens
 * next, in the bakery's voice.
 */
export function buyerOrderConfirmationEmail(order: OrderEmailInput): MailMessage {
  const onAccount = order.paymentTerms === "account";
  return {
    to: order.email,
    subject: `Order #${order.orderNumber} confirmed — Dallas Bakery Wholesale`,
    text: [
      `Hi ${firstName(order.customerName)},`,
      ``,
      `Thanks — order #${order.orderNumber} is in.`,
      ``,
      ...orderLines(order),
      ``,
      `Subtotal: ${dollars(order.subtotalCents)}`,
      `Shipping (${order.boxCount} box${order.boxCount === 1 ? "" : "es"}): ${dollars(order.shippingCents)}`,
      onAccount
        ? `Total on account: ${dollars(order.totalCents)} — nothing was charged to a card. ` +
          (order.termsLabel && order.invoiceDueAt
            ? `We'll invoice you on ${order.termsLabel} terms; payment is due by ${order.invoiceDueAt}.`
            : `We'll invoice you on your usual terms.`)
        : `Total charged: ${dollars(order.totalCents)}`,
      ``,
      order.shipsToday
        ? `You ordered before the noon Central cutoff, so it bakes and ships today.`
        : `It bakes and ships the next business day.`,
      `We'll email your UPS tracking number the moment it leaves the bakery, and you can follow every order under My Orders.`,
      ``,
      `The bread keeps 14 days at room temperature — no refrigeration needed.`,
      ``,
      `Questions about this order? Reply to this email or reach us at ${SUPPORT_EMAIL} - ${SUPPORT_PHONE}.`,
      ``,
      `- Dallas Bakery Wholesale`,
    ].join("\n"),
  };
}

/**
 * Sent when a standing order could not be charged — the buyer must hear this
 * the same morning, because the bread they expect is not coming otherwise.
 * The reason is summarised, never Stripe's raw message, which can carry
 * configuration detail.
 */
export function standingOrderProblemEmail(email: string, reason: string): MailMessage {
  const cardProblem = /card|payment|declined|authentication/i.test(reason);
  return {
    to: email,
    subject: "Your Dallas Bakery standing order needs attention",
    text: [
      `Hi,`,
      ``,
      `We tried to place your standing weekly order this morning, but it did not go through.`,
      ``,
      cardProblem
        ? `The saved card could not be charged. Sign in at https://dallasbakery.net/order, place the order by card, and the new card will be saved for next week.`
        : `Sign in at https://dallasbakery.net/order to review your standing order, or simply place this week's order there.`,
      ``,
      `Nothing was charged. If you'd rather sort it out by phone: ${SUPPORT_PHONE}.`,
      ``,
      `- Dallas Bakery Wholesale`,
    ].join("\n"),
  };
}

/**
 * The receipt for closing an account — the last mail this address will get
 * from us, and the only record the buyer keeps of what was erased and what
 * the bakery still holds. Sent before the address is scrubbed.
 */
export function buyerAccountClosedEmail(input: {
  email: string;
  businessName: string;
  contactName: string;
  ordersRetained: number;
  outstandingCents: number;
}): MailMessage {
  const owes = input.outstandingCents > 0;
  return {
    to: input.email,
    subject: "Your Dallas Bakery wholesale account is closed",
    text: [
      `Hi ${firstName(input.contactName)},`,
      ``,
      `The wholesale account for ${input.businessName} is closed. This is the last email`,
      `we'll send to this address.`,
      ``,
      `What we deleted:`,
      `  - Your business and contact details`,
      `  - Your saved delivery addresses`,
      `  - Your saved card (removed at our payment processor too)`,
      `  - Your standing weekly order, if you had one`,
      `  - Any pricing set specifically for you`,
      `  - Your devices registered for notifications`,
      `  - Your entry on our email list`,
      ``,
      `What we have to keep:`,
      input.ordersRetained > 0
        ? `  - ${input.ordersRetained} past order${input.ordersRetained === 1 ? "" : "s"}, with the name and address each one shipped to.`
        : `  - Nothing. You had no orders on file.`,
      input.ordersRetained > 0
        ? `    Sales records are required for tax and accounting, and we can't delete them.`
        : ``,
      ``,
      owes
        ? [
            `Your balance:`,
            `  ${dollars(input.outstandingCents)} is still owed on unpaid invoices. Closing the account`,
            `  does not cancel it. Call ${SUPPORT_PHONE} and we'll settle it with you.`,
            ``,
          ].join("\n")
        : `You owed nothing when the account closed.`,
      ``,
      `If this wasn't you, call us right away at ${SUPPORT_PHONE}.`,
      ``,
      `Thanks for baking with us.`,
      ``,
      `- Dallas Bakery Wholesale`,
      `${SUPPORT_PHONE} · ${SUPPORT_EMAIL}`,
    ].filter((line) => line !== "").join("\n"),
  };
}

/** Tells the owner an account left, and whether it left owing money. */
export function ownerAccountClosedEmail(input: {
  businessName: string;
  email: string;
  reason: string;
  ordersRetained: number;
  outstandingCents: number;
}): MailMessage {
  return {
    to: ownerNotificationAddress(),
    subject: input.outstandingCents > 0
      ? `Account closed with ${dollars(input.outstandingCents)} outstanding — ${input.businessName}`
      : `Wholesale account closed — ${input.businessName}`,
    text: [
      `${input.businessName} (${input.email}) closed their wholesale account from the app.`,
      ``,
      input.reason ? `Reason given: ${input.reason}` : `No reason given.`,
      ``,
      `Their contact details, saved addresses, saved card, standing order, and any`,
      `exclusive pricing are gone. ${input.ordersRetained} past order${input.ordersRetained === 1 ? "" : "s"} remain in the`,
      `shipping queue and your books, which is what the records require.`,
      ``,
      input.outstandingCents > 0
        ? `THEY STILL OWE ${dollars(input.outstandingCents)} on unpaid invoices. Closing the account does not`
        + `\ncancel that — chase it the way you would any other receivable.`
        : `They owed nothing.`,
      ``,
      `- Dallas Bakery Wholesale`,
    ].join("\n"),
  };
}
