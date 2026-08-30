/**
 * The rules a marketing email has to follow, and the footer that makes one
 * legal to send.
 *
 * Marketing mail is not transactional mail: CAN-SPAM requires a physical
 * postal address and a working one-click unsubscribe in every commercial
 * message, and requires honouring an unsubscribe within ten business days.
 * Getting this wrong is a $53,088-per-email problem, so the footer is
 * generated here rather than typed by hand into each campaign.
 *
 * No database import, so the composition rules stay unit-testable.
 */

export const POSTAL_ADDRESS = "Dallas Bakery, 2643 Manana Dr, Dallas, TX 75220";
export const SUPPORT_EMAIL = "sales@dallasbakery.com";
export const SUPPORT_PHONE = "(469) 729-4706";

export const MAX_SUBJECT_LENGTH = 120;
export const MAX_BODY_LENGTH = 8000;

export type CampaignDraft = {
  subject: string;
  body: string;
};

/**
 * Checks a campaign before it goes anywhere. Refuses the two things that
 * most often get a sending domain blocked: an empty subject, and a subject
 * that promises something the body does not deliver by being all capitals.
 */
export function validateCampaign(draft: CampaignDraft): string | null {
  const subject = String(draft.subject || "").trim();
  const body = String(draft.body || "").trim();
  if (!subject) return "Give the email a subject line.";
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return `Keep the subject under ${MAX_SUBJECT_LENGTH} characters.`;
  }
  const letters = subject.replace(/[^A-Za-z]/g, "");
  if (letters.length > 8 && letters === letters.toUpperCase()) {
    return "An all-capitals subject line gets filtered as spam. Use normal capitalisation.";
  }
  if (!body) return "Write the message before sending it.";
  if (body.length > MAX_BODY_LENGTH) {
    return `Keep the message under ${MAX_BODY_LENGTH} characters.`;
  }
  return null;
}

/**
 * The legally required footer. The unsubscribe link is per-subscriber, so a
 * click identifies exactly who to remove without asking them to log in.
 */
export function campaignFooter(unsubscribeUrl: string) {
  return [
    "—",
    `You're getting this because you asked us to keep you posted about Dallas Bakery wholesale.`,
    `Unsubscribe: ${unsubscribeUrl}`,
    POSTAL_ADDRESS,
    `${SUPPORT_PHONE} · ${SUPPORT_EMAIL}`,
  ].join("\n");
}

/** Greets by business name when there is one, and never awkwardly when not. */
export function greeting(businessName: string) {
  const name = String(businessName || "").trim();
  return name ? `Hi ${name},` : "Hi there,";
}

/**
 * Assembles one subscriber's copy of a campaign: greeting, the owner's text,
 * then the footer. Kept as plain text — a wholesale buyer reads this on a
 * phone between deliveries, and plain text lands in the inbox far more
 * reliably than a designed template from a new sending domain.
 */
export function composeCampaign(
  draft: CampaignDraft,
  subscriber: { businessName: string },
  unsubscribeUrl: string,
) {
  return [
    greeting(subscriber.businessName),
    "",
    String(draft.body || "").trim(),
    "",
    campaignFooter(unsubscribeUrl),
  ].join("\n");
}

/**
 * A test send to the owner, marked so it is obvious in an inbox and can never
 * be mistaken for the real campaign going out.
 */
export function previewSubject(subject: string) {
  return `[Test] ${subject}`;
}
