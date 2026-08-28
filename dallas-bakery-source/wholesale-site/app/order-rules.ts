/**
 * Wholesale order rules — one definition, used by the website, the public
 * settings API (and through it the buyer app), and the notification emails,
 * so a buyer is never told two different things.
 *
 * These mirror the retail policy at dallasbakery.com, with the two wholesale
 * differences the owner set: a same-day cutoff and a case minimum. Shipping
 * stays a separate per-box charge on wholesale (retail includes it in the
 * shelf price) and is configured in the shipping settings, not here.
 */

export const ORDER_CUTOFF_HOUR = 12; // noon, local bakery time
export const ORDER_CUTOFF_TIME_ZONE = "America/Chicago";
export const ORDER_CUTOFF_LABEL = "12:00 PM Central";
export const MINIMUM_CASES = 1;
export const LEAD_TIME_LABEL = "1–4 business days";
export const SHELF_LIFE_DAYS = 14;
export const CLAIM_WINDOW_DAYS = 7;
export const CARRIER_LABEL = "UPS Ground";

/** Contiguous United States. Alaska, Hawaii, and territories are not served. */
export const DELIVERABLE_STATES = [
  "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "IA", "ID",
  "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS",
  "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV",
  "WY",
] as const;

const DELIVERABLE_SET = new Set<string>(DELIVERABLE_STATES);

export function isDeliverableState(state: string) {
  return DELIVERABLE_SET.has(String(state || "").trim().toUpperCase());
}

export const OUT_OF_AREA_MESSAGE =
  "Dallas Bakery ships wholesale orders within the contiguous United States. " +
  "For Alaska, Hawaii, or a U.S. territory, email sales@dallasbakery.com and we'll look at options together.";

type ClockParts = { hour: number; weekday: number };

/**
 * Reads the wall clock at the bakery, independent of where the server runs.
 * Workers run in UTC, so the cutoff has to be evaluated in Central time or it
 * drifts by five or six hours depending on the season.
 */
function bakeryClock(now: Date): ClockParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORDER_CUTOFF_TIME_ZONE,
    hour: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(now);
  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "0";
  const weekdayPart = parts.find((part) => part.type === "weekday")?.value ?? "Mon";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    hour: Number(hourPart) % 24,
    weekday: Math.max(0, weekdays.indexOf(weekdayPart)),
  };
}

export type CutoffState = {
  /** True when an order placed now still bakes and ships today. */
  shipsToday: boolean;
  /** Plain-language answer for the buyer, e.g. "Ships tomorrow". */
  label: string;
  cutoffLabel: string;
};

export function cutoffState(now: Date = new Date()): CutoffState {
  const { hour, weekday } = bakeryClock(now);
  const isBusinessDay = weekday >= 1 && weekday <= 5;
  const shipsToday = isBusinessDay && hour < ORDER_CUTOFF_HOUR;

  let label: string;
  if (shipsToday) label = "Order now and it ships today";
  else if (!isBusinessDay) label = "Orders placed over the weekend ship Monday";
  else if (weekday === 5) label = "Past today's cutoff — this order ships Monday";
  else label = "Past today's cutoff — this order ships the next business day";

  return { shipsToday, label, cutoffLabel: ORDER_CUTOFF_LABEL };
}

export type OrderRules = {
  cutoffLabel: string;
  minimumCases: number;
  minimumLabel: string;
  leadTimeLabel: string;
  carrier: string;
  deliveryAreaLabel: string;
  shelfLifeDays: number;
  claimWindowDays: number;
};

export function orderRules(): OrderRules {
  return {
    cutoffLabel: ORDER_CUTOFF_LABEL,
    minimumCases: MINIMUM_CASES,
    minimumLabel: MINIMUM_CASES === 1 ? "1 case" : `${MINIMUM_CASES} cases`,
    leadTimeLabel: LEAD_TIME_LABEL,
    carrier: CARRIER_LABEL,
    deliveryAreaLabel: "Contiguous United States",
    shelfLifeDays: SHELF_LIFE_DAYS,
    claimWindowDays: CLAIM_WINDOW_DAYS,
  };
}

/** The same six lines everywhere: site FAQ, approval email, buyer app. */
export function orderRulesLines(): string[] {
  const rules = orderRules();
  return [
    `Order cutoff: ${rules.cutoffLabel}. Orders placed before the cutoff on a business day are baked and shipped that day; later orders go out the next business day.`,
    `Minimum order: ${rules.minimumLabel}.`,
    `Delivery: ${rules.carrier} to the ${rules.deliveryAreaLabel}, most orders arriving in ${rules.leadTimeLabel}. Tracking is emailed when the order ships.`,
    `Shelf life: ${rules.shelfLifeDays} days at room temperature, no refrigeration needed.`,
    `If an order is late, lost, or damaged, contact us within ${rules.claimWindowDays} days of delivery (or the expected delivery date) for a replacement or refund.`,
  ];
}
