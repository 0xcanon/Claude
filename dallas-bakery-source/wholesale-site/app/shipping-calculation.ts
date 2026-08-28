export const DEFAULT_SHIPPING_RATE_CENTS = 1_250;
export const DEFAULT_UNITS_PER_BOX = 25;

export type ShippingRate = {
  rateCents: number;
  unitsPerBox: number;
};

export function validateShippingRate(rateCents: number, unitsPerBox: number): ShippingRate {
  if (!Number.isInteger(rateCents) || rateCents < 0 || rateCents > 100_000) {
    throw new Error("Shipping must be between $0.00 and $1,000.00 per box.");
  }
  if (!Number.isInteger(unitsPerBox) || unitsPerBox < 1 || unitsPerBox > 1_000) {
    throw new Error("Box size must be between 1 and 1,000 units.");
  }
  return { rateCents, unitsPerBox };
}

export function shippingBoxesForQuantity(quantity: number, unitsPerBox: number) {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new Error("Quantity must be a non-negative whole number.");
  }
  validateShippingRate(0, unitsPerBox);
  return quantity === 0 ? 0 : Math.ceil(quantity / unitsPerBox);
}

export function shippingCostCents(quantity: number, rate: ShippingRate) {
  const validated = validateShippingRate(rate.rateCents, rate.unitsPerBox);
  return shippingBoxesForQuantity(quantity, validated.unitsPerBox) * validated.rateCents;
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/**
 * Parcel weight in ounces. UPS bills on this, so it only accepts a value a
 * real packed bread box could weigh — 1 to 150 lb (UPS's own package cap).
 */
export function validateParcelWeightOz(weightOz: number) {
  if (!Number.isInteger(weightOz) || weightOz < 16 || weightOz > 150 * 16) {
    throw new Error("Box weight must be between 1 and 150 pounds.");
  }
  return weightOz;
}
