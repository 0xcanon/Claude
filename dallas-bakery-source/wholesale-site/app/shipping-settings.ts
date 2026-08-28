import { eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { wholesaleShippingSettings } from "../db/schema";
import {
  DEFAULT_SHIPPING_RATE_CENTS,
  DEFAULT_UNITS_PER_BOX,
  formatUsd,
  validateParcelWeightOz,
  validateShippingRate,
} from "./shipping-calculation";

const SHIPPING_SETTINGS_ID = "wholesale";

export type WholesaleShippingSettings = {
  rateCents: number;
  unitsPerBox: number;
  formattedRate: string;
  /** Parcel details UPS bills on. Confirm against a real packed box. */
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
  updatedAt: string | null;
};

export const DEFAULT_PARCEL = {
  // Measured carton: 24 x 16 x 6 in, and a packed box weighs 27 lb (432 oz)
  // — the owner's measured weight, confirmed 2026-08-28. UPS bills on this;
  // if the packing ever changes, re-weigh and update it in /admin.
  boxWeightOz: 432,
  boxLengthIn: 24,
  boxWidthIn: 16,
  boxHeightIn: 6,
};

function present(row?: {
  rateCents: number;
  unitsPerBox: number;
  boxWeightOz?: number;
  boxLengthIn?: number;
  boxWidthIn?: number;
  boxHeightIn?: number;
  updatedAt: string;
}): WholesaleShippingSettings {
  const rateCents = row?.rateCents ?? DEFAULT_SHIPPING_RATE_CENTS;
  const unitsPerBox = row?.unitsPerBox ?? DEFAULT_UNITS_PER_BOX;
  return {
    rateCents,
    unitsPerBox,
    formattedRate: formatUsd(rateCents),
    boxWeightOz: row?.boxWeightOz ?? DEFAULT_PARCEL.boxWeightOz,
    boxLengthIn: row?.boxLengthIn ?? DEFAULT_PARCEL.boxLengthIn,
    boxWidthIn: row?.boxWidthIn ?? DEFAULT_PARCEL.boxWidthIn,
    boxHeightIn: row?.boxHeightIn ?? DEFAULT_PARCEL.boxHeightIn,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function getWholesaleShippingSettings() {
  const [row] = await getDb()
    .select({
      rateCents: wholesaleShippingSettings.rateCents,
      unitsPerBox: wholesaleShippingSettings.unitsPerBox,
      boxWeightOz: wholesaleShippingSettings.boxWeightOz,
      boxLengthIn: wholesaleShippingSettings.boxLengthIn,
      boxWidthIn: wholesaleShippingSettings.boxWidthIn,
      boxHeightIn: wholesaleShippingSettings.boxHeightIn,
      updatedAt: wholesaleShippingSettings.updatedAt,
    })
    .from(wholesaleShippingSettings)
    .where(eq(wholesaleShippingSettings.id, SHIPPING_SETTINGS_ID))
    .limit(1);
  return present(row);
}

export async function updateWholesaleShippingSettings(input: {
  rateCents: number;
  unitsPerBox: number;
  /** Omitted = leave the stored weight alone. */
  boxWeightOz?: number;
  updatedBy: string;
}) {
  const validated: Record<string, number> = {
    ...validateShippingRate(input.rateCents, input.unitsPerBox),
  };
  if (input.boxWeightOz !== undefined) {
    validated.boxWeightOz = validateParcelWeightOz(input.boxWeightOz);
  }
  await getDb()
    .insert(wholesaleShippingSettings)
    .values({
      id: SHIPPING_SETTINGS_ID,
      ...validated,
      updatedBy: input.updatedBy.toLowerCase(),
    })
    .onConflictDoUpdate({
      target: wholesaleShippingSettings.id,
      set: {
        ...validated,
        updatedBy: input.updatedBy.toLowerCase(),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    });
  return getWholesaleShippingSettings();
}
