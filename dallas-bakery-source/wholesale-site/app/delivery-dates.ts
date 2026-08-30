/**
 * Which days a buyer may ask for delivery.
 *
 * The bakery bakes to order against a noon Central cutoff, then ships UPS
 * Ground, which moves only on business days. So the earliest a box can
 * realistically land is the first business day after it ships, and the
 * honest outside edge is four business days after that.
 *
 * A chosen date is a REQUEST, not a courier guarantee — the wording
 * everywhere says "requested". No database import, so the arithmetic stays
 * unit-testable and the same rules run on the website, the app, and intake.
 */

import { ORDER_CUTOFF_HOUR, ORDER_CUTOFF_TIME_ZONE } from "./order-rules.ts";

/** Transit days UPS Ground needs, best case to worst case. */
export const MIN_TRANSIT_BUSINESS_DAYS = 1;
export const MAX_TRANSIT_BUSINESS_DAYS = 4;
/** How far ahead a buyer may schedule. */
export const DELIVERY_HORIZON_BUSINESS_DAYS = 20;

/** The bakery's own wall clock, so the cutoff means noon in Dallas. */
function bakeryParts(now: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: ORDER_CUTOFF_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  ) as Record<string, string>;
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday || "");
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    weekday: weekdayIndex,
  };
}

function isoToUtc(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function utcToIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Monday–Friday. The bakery does not ship, and UPS does not move, at weekends. */
export function isBusinessDay(iso: string) {
  const day = isoToUtc(iso).getUTCDay();
  return day >= 1 && day <= 5;
}

/** The next business day strictly after the given date. */
export function nextBusinessDay(iso: string) {
  const cursor = isoToUtc(iso);
  do {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  } while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6);
  return utcToIso(cursor);
}

/** Adds business days to a date, skipping weekends. */
export function addBusinessDays(iso: string, days: number) {
  let cursor = iso;
  for (let step = 0; step < days; step += 1) cursor = nextBusinessDay(cursor);
  return cursor;
}

/**
 * The day this order leaves the bakery: today when it is a business day and
 * the cutoff has not passed, otherwise the next business day.
 */
export function shipDateFor(now: Date = new Date()): string {
  const { date, hour, weekday } = bakeryParts(now);
  const isWeekday = weekday >= 1 && weekday <= 5;
  if (isWeekday && hour < ORDER_CUTOFF_HOUR) return date;
  return nextBusinessDay(date);
}

export type DeliveryWindow = {
  /** The day the bakery ships (YYYY-MM-DD). */
  shipDate: string;
  /** Earliest realistic delivery. */
  earliest: string;
  /** Outside edge of the normal ground window. */
  latest: string;
  /** Every date a buyer may request, earliest first. */
  options: string[];
};

/**
 * The delivery choices to offer a buyer ordering right now. The list starts
 * at the earliest realistic date so nobody can request a day the bread
 * physically cannot arrive.
 */
export function deliveryWindowFor(now: Date = new Date()): DeliveryWindow {
  const shipDate = shipDateFor(now);
  const earliest = addBusinessDays(shipDate, MIN_TRANSIT_BUSINESS_DAYS);
  const latest = addBusinessDays(shipDate, MAX_TRANSIT_BUSINESS_DAYS);
  const options: string[] = [];
  let cursor = earliest;
  for (let step = 0; step < DELIVERY_HORIZON_BUSINESS_DAYS; step += 1) {
    options.push(cursor);
    cursor = nextBusinessDay(cursor);
  }
  return { shipDate, earliest, latest, options };
}

/**
 * Validates a requested delivery date. An empty request is always fine —
 * choosing a date is optional and means "as soon as it arrives".
 */
export function validateRequestedDeliveryDate(
  requested: string,
  now: Date = new Date(),
): string | null {
  const value = String(requested || "").trim();
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Pick a delivery date from the list.";
  const window = deliveryWindowFor(now);
  if (!isBusinessDay(value)) return "We deliver on business days only — pick a weekday.";
  if (value < window.earliest) {
    return `The earliest we can get this to you is ${formatDeliveryDate(window.earliest)}.`;
  }
  const horizonEnd = window.options[window.options.length - 1]!;
  if (value > horizonEnd) return "That date is too far ahead — pick one within the next few weeks.";
  return null;
}

/** "Thu, Sep 12" — how a delivery date reads to a buyer. */
export function formatDeliveryDate(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""))) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(isoToUtc(iso));
}
