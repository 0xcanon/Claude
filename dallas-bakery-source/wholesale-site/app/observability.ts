/**
 * Knowing when something is broken.
 *
 * A bakery owner is not going to read logs. So this does two things: it makes
 * the logs structured enough to be searched when someone does look, and it
 * emails the owner when something fails that they would otherwise never find
 * out about — a cron that did not run, a label that could not be bought, a
 * webhook that could not be recorded.
 *
 * The alert is rate-limited per kind so a broken integration sends one email
 * an hour, not one per request. Nothing here can throw: an observability
 * failure must never be the reason an order fails.
 */

import { ownerNotificationAddress, sendMail } from "./email-notifications.ts";

/** How long before the same kind of failure is worth emailing about again. */
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/** Last alert time per kind. Per-isolate, which is enough to stop a storm. */
const lastAlertAt = new Map<string, number>();

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

/**
 * One structured line. JSON so Cloudflare's log search can filter on a field
 * rather than a substring, and so a request id ties a buyer's report ("it
 * failed at about 10:15") to the exact request.
 */
export function log(level: LogLevel, event: string, fields: LogFields = {}) {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...redact(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/**
 * Strips the things that must never reach a log line.
 *
 * Sign-in codes, document tokens, push tokens, card data and session tokens
 * are all values that would let whoever reads the logs act as somebody else.
 */
const SECRET_KEYS = /token|code|secret|password|authorization|card|cvc|pan/i;

function redact(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    safe[key] = SECRET_KEYS.test(key) ? "[redacted]" : value;
  }
  return safe;
}

/** A short id to tie a log line to a request, and to a buyer's bug report. */
export function newRequestId() {
  return crypto.randomUUID().slice(0, 8);
}

export type FailureKind =
  | "webhook"
  // A payment went through for an amount that is not today's price.
  | "webhook-amount"
  | "cron-standing-orders"
  | "cron-invoice-reminders"
  | "ups-label"
  | "mail"
  | "push"
  | "stripe"
  | "database";

/**
 * Something failed that the owner needs to know about.
 *
 * Logged always; emailed at most once an hour per kind, because the point is
 * to be told once that UPS is down, not four hundred times.
 */
export async function alertOwner(
  kind: FailureKind,
  summary: string,
  detail: LogFields = {},
) {
  log("error", `failure.${kind}`, { summary, ...detail });

  const now = Date.now();
  const previous = lastAlertAt.get(kind) || 0;
  if (now - previous < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(kind, now);

  const to = ownerNotificationAddress();
  if (!to) return;

  try {
    await sendMail({
      to,
      subject: `Dallas Bakery: ${TITLES[kind]}`,
      text: [
        `Something on the wholesale system needs your attention.`,
        ``,
        `What: ${TITLES[kind]}`,
        `Detail: ${summary}`,
        ``,
        ...Object.entries(redact(detail)).map(([key, value]) => `  ${key}: ${value}`),
        ``,
        ADVICE[kind],
        ``,
        `You'll get at most one of these an hour for this kind of problem, so`,
        `if it keeps happening you won't be buried in email.`,
        ``,
        `- Dallas Bakery Wholesale`,
      ].join("\n"),
    });
  } catch (caught) {
    // Alerting about a mail failure by email cannot work. Log and move on.
    console.error("Owner alert could not be sent:", caught);
  }
}

const TITLES: Record<FailureKind, string> = {
  webhook: "a paid order could not be recorded",
  "webhook-amount": "an order was charged a different amount than it prices at now",
  "cron-standing-orders": "the standing-order run failed",
  "cron-invoice-reminders": "the invoice reminder run failed",
  "ups-label": "a UPS label could not be bought",
  mail: "email is not going out",
  push: "notifications are not being delivered",
  stripe: "Stripe rejected something",
  database: "the database is not responding",
};

const ADVICE: Record<FailureKind, string> = {
  webhook:
    "A customer has paid and the order may not be in your shipping queue. Check Stripe\n" +
    "for recent payments and compare against today's orders in /admin.",
  "webhook-amount":
    "Nothing is broken and the order is in your queue for the amount actually charged.\n" +
    "This happens when a price changes while someone has a cart open. If you did not\n" +
    "change a price today, look at the order before you invoice it.",
  "cron-standing-orders":
    "Standing weekly orders may not have been placed this morning. Check /admin and\n" +
    "place them by hand if today's are missing.",
  "cron-invoice-reminders":
    "Invoice reminders did not go out. Nothing is broken for buyers, but nobody was\n" +
    "nudged about a due invoice today.",
  "ups-label":
    "Check the UPS credentials in your settings, and whether the address on the order\n" +
    "is valid. You can retry the label from the shipping queue.",
  mail:
    "Buyers are not receiving sign-in codes, confirmations, or tracking. Check the\n" +
    "mail provider's dashboard and that the sending domain is still verified.",
  push:
    "App notifications are not arriving. Email still works, so this is not urgent.",
  stripe:
    "Check the Stripe dashboard. If it is a refund or a charge, the money may not have\n" +
    "moved — do not retry blindly.",
  database:
    "This is serious: orders cannot be read or written. Check the Cloudflare dashboard\n" +
    "for D1 status.",
};

/** Only for tests: forget the rate-limit state. */
export function resetAlertThrottleForTests() {
  lastAlertAt.clear();
}
