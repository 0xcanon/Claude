/**
 * When a standing order runs — pure date logic, no database, so it stays
 * unit-testable. All decisions are made in the bakery's own time zone: a
 * Tuesday order runs on Central Tuesday, whatever UTC thinks the day is.
 */

import { ORDER_CUTOFF_TIME_ZONE } from "./order-rules.ts";

export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/** YYYY-MM-DD in the bakery's own time zone — the cron's day boundary. */
export function centralDateString(now: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORDER_CUTOFF_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** 0 = Sunday … 6 = Saturday, in Central time. */
export function centralWeekday(now: Date = new Date()) {
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: ORDER_CUTOFF_TIME_ZONE,
    weekday: "long",
  }).format(now);
  return WEEKDAY_NAMES.indexOf(name as (typeof WEEKDAY_NAMES)[number]);
}

/** Whether this standing order should run right now. */
export function isDueToday(
  order: { active: boolean; weekday: number; lastRunDate: string },
  now: Date = new Date(),
) {
  return Boolean(order.active)
    && order.weekday === centralWeekday(now)
    && order.lastRunDate !== centralDateString(now);
}
