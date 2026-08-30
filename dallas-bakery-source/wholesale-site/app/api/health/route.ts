/**
 * Is the system actually working?
 *
 * Deliberately more than "the Worker is up": a Worker that responds while the
 * database is unreachable is not healthy, and that is exactly the failure an
 * uptime monitor would otherwise miss. So this reads a row, and reports
 * whether each integration is configured.
 *
 * Point any uptime monitor at it and alert on a non-200. It exposes no
 * customer data and no secrets — only whether things are wired up — so it is
 * safe to leave public, which is what lets a monitor reach it.
 */

import { sql } from "drizzle-orm";

import { getDb } from "../../../db";
import { mailConfigured, ownerNotificationAddress } from "../../email-notifications.ts";
import { log } from "../../observability.ts";
import { stripeConfigured } from "../../stripe.ts";
import { upsConfigured, upsIsProduction } from "../../ups-shipping.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();

  // The one check that matters: can we actually reach the database? A count
  // against a real table, not SELECT 1, so a missing migration shows up too.
  let database: "ok" | "unreachable" = "unreachable";
  let databaseError = "";
  try {
    await getDb().run(sql`SELECT COUNT(*) FROM products`);
    database = "ok";
  } catch (caught) {
    databaseError = caught instanceof Error ? caught.message : "unknown";
    log("error", "health.database_unreachable", { error: databaseError });
  }

  const checks = {
    database,
    // Configured, not necessarily working — a live call to each on every
    // health check would cost money and rate limit.
    stripe: stripeConfigured() ? "configured" : "missing",
    ups: upsConfigured() ? (upsIsProduction() ? "production" : "test") : "missing",
    mail: mailConfigured() ? "configured" : "missing",
    ownerAlerts: ownerNotificationAddress() ? "configured" : "missing",
  };

  // Only the database can make the system unhealthy. A bakery with no UPS
  // credentials yet is not broken, it is mid-setup — and a monitor that
  // cries wolf during setup gets muted.
  const healthy = database === "ok";

  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      checks,
      ...(databaseError ? { error: databaseError } : {}),
      tookMs: Date.now() - started,
      at: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
