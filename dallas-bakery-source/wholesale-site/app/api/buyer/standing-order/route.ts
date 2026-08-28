/**
 * The buyer's standing weekly order: read it, set it, pause it.
 *
 * Setting one stores SKUs and case counts only — every run re-prices from the
 * live catalog, so a price change is charged at the new price, never the old.
 * Charging happens in the daily cron (app/standing-orders.ts), not here.
 */

import { BuyerAuthError, requireBuyer } from "../../../buyer-auth.ts";
import { listApprovedLocations } from "../../../buyer-locations.ts";
import { getWholesaleShippingSettings } from "../../../shipping-settings.ts";
import { WEEKDAY_NAMES } from "../../../standing-schedule.ts";
import {
  getStandingOrder,
  pauseStandingOrder,
  setStandingOrder,
} from "../../../standing-orders.ts";
import { priceOverridesFor } from "../../../customer-pricing.ts";
import { decodeCartLines, priceCart, type CartLine } from "../../../wholesale-catalog.ts";

export const dynamic = "force-dynamic";

async function describe(applicationId: string) {
  const row = await getStandingOrder(applicationId);
  if (!row) return null;
  const shipping = await getWholesaleShippingSettings();
  const cart = await priceCart(decodeCartLines(row.lines), shipping, await priceOverridesFor(applicationId));
  return {
    weekday: row.weekday,
    weekdayName: WEEKDAY_NAMES[row.weekday] || "—",
    active: row.active,
    locationId: row.locationId,
    lastRunDate: row.lastRunDate,
    lastRunStatus: row.lastRunStatus,
    lines: decodeCartLines(row.lines),
    // Present-day pricing, so the buyer always sees what next week costs.
    summary: cart.ok
      ? { caseCount: cart.caseCount, totalCents: cart.totalCents, shippingCents: cart.shippingCents }
      : null,
  };
}

export async function GET(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    return Response.json(
      { standingOrder: await describe(buyer.applicationId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Standing order read failed:", caught);
    return Response.json({ error: "Your standing order could not be loaded." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const buyer = await requireBuyer(request);
    let body: { weekday?: number; lines?: CartLine[]; locationId?: string; action?: string };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }

    if (body.action === "pause") {
      await pauseStandingOrder(buyer.applicationId);
      return Response.json({ standingOrder: await describe(buyer.applicationId) });
    }

    const weekday = Number(body.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return Response.json({ error: "Pick a day of the week." }, { status: 400 });
    }
    const shipping = await getWholesaleShippingSettings();
    const cart = await priceCart(Array.isArray(body.lines) ? body.lines : [], shipping, await priceOverridesFor(buyer.applicationId));
    if (!cart.ok) return Response.json({ error: cart.error }, { status: 400 });

    const locations = await listApprovedLocations(buyer);
    const locationId = locations.some((location) => location.id === body.locationId)
      ? String(body.locationId)
      : locations[0]!.id;

    await setStandingOrder({
      applicationId: buyer.applicationId,
      email: buyer.email,
      weekday,
      lines: cart.lines.map((line) => ({ sku: line.sku, cases: line.cases })),
      locationId,
    });
    return Response.json({ standingOrder: await describe(buyer.applicationId) });
  } catch (caught) {
    if (caught instanceof BuyerAuthError) {
      return Response.json({ error: caught.message }, { status: caught.status });
    }
    console.error("Standing order write failed:", caught);
    return Response.json({ error: "Your standing order could not be saved." }, { status: 500 });
  }
}
