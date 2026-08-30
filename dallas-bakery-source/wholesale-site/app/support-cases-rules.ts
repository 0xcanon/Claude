/**
 * What a buyer can raise a problem about, and how it is worded.
 *
 * Reasons are a fixed list rather than free text so the owner can see that
 * three shops reported a damaged box on the same morning — which is a pallet
 * problem, not three unlucky customers. The free-text message sits underneath.
 *
 * No database import, so the wording and the validation are unit-testable.
 */

export const MAX_SUPPORT_MESSAGE_LENGTH = 2000;
export const MAX_SUPPORT_REPLY_LENGTH = 2000;

export type SupportReason =
  | "damaged"
  | "short"
  | "wrong-item"
  | "late"
  | "billing"
  | "change"
  | "other";

export type SupportReasonOption = {
  key: SupportReason;
  /** What the buyer picks. */
  label: string;
  /** The prompt under it, so the first message is actually useful. */
  prompt: string;
  /** True when the bakery usually owes money back for this. */
  likelyRefund: boolean;
  /** True when it only makes sense against a specific order. */
  needsOrder: boolean;
};

export const SUPPORT_REASONS: SupportReasonOption[] = [
  {
    key: "damaged",
    label: "Something arrived damaged",
    prompt: "Which bread, how many cases, and what does the damage look like? A photo helps — reply to our email with one.",
    likelyRefund: true,
    needsOrder: true,
  },
  {
    key: "short",
    label: "The order was short",
    prompt: "Which bread, how many cases you expected, and how many actually arrived.",
    likelyRefund: true,
    needsOrder: true,
  },
  {
    key: "wrong-item",
    label: "We got the wrong bread",
    prompt: "What you ordered and what turned up.",
    likelyRefund: true,
    needsOrder: true,
  },
  {
    key: "late",
    label: "It hasn't arrived",
    prompt: "When you expected it. We'll chase UPS and come back to you.",
    likelyRefund: false,
    needsOrder: true,
  },
  {
    key: "billing",
    label: "A question about an invoice",
    prompt: "Which invoice, and what doesn't look right.",
    likelyRefund: false,
    needsOrder: false,
  },
  {
    key: "change",
    label: "I need to change or cancel an order",
    prompt: "What needs to change. If it hasn't shipped we can usually still fix it.",
    likelyRefund: false,
    needsOrder: true,
  },
  {
    key: "other",
    label: "Something else",
    prompt: "Tell us what's going on.",
    likelyRefund: false,
    needsOrder: false,
  },
];

export function supportReason(key: string): SupportReasonOption | null {
  return SUPPORT_REASONS.find((option) => option.key === key) || null;
}

export type SupportCaseStatus = "open" | "answered" | "resolved";

/**
 * Checks a case a buyer is about to raise. Returns an error message, or null.
 */
export function validateSupportCase(input: {
  reason: string;
  message: string;
  orderId?: string;
}): string | null {
  const option = supportReason(input.reason);
  if (!option) return "Pick what the problem is about.";

  const message = String(input.message || "").trim();
  if (message.length < 10) {
    return "Tell us a little more — a sentence or two is enough for us to act on.";
  }
  if (message.length > MAX_SUPPORT_MESSAGE_LENGTH) {
    return `Keep it under ${MAX_SUPPORT_MESSAGE_LENGTH} characters, or call us instead.`;
  }
  if (option.needsOrder && !String(input.orderId || "").trim()) {
    return "Choose which order this is about.";
  }
  return null;
}

/** How urgently the bakery should look at this, for sorting the queue. */
export function supportPriority(reason: string, ageHours: number): "now" | "today" | "soon" {
  const option = supportReason(reason);
  // Anything that costs the buyer money, or a box that has gone missing,
  // goes to the top — those are the ones that lose an account.
  if (option?.likelyRefund || reason === "late") return "now";
  if (ageHours >= 24) return "now";
  if (ageHours >= 4) return "today";
  return "soon";
}

/** "3 hours ago" — how long the buyer has been waiting. */
export function waitingFor(hours: number) {
  const whole = Math.max(0, Math.floor(hours));
  if (whole < 1) return "just now";
  if (whole === 1) return "1 hour ago";
  if (whole < 24) return `${whole} hours ago`;
  const days = Math.floor(whole / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
