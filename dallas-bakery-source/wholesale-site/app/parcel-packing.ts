/**
 * Which boxes an order ships in — pure, no database import.
 *
 * Wholesale packs one case per box, and each product carries its own parcel
 * (weight and dimensions the owner set in /admin). The UPS shipment is built
 * from these, so a 27 lb Barbari case and a lighter mini case are each billed
 * at their own real weight instead of one global number.
 */

export type ShipmentPackage = {
  description: string;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
};

export type PackableItem = { sku: string; name: string; quantity: number };

export type ProductParcel = {
  boxWeightOz: number;
  boxLengthIn: number;
  boxWidthIn: number;
  boxHeightIn: number;
};

/** UPS accepts many packages per shipment; this cap keeps a fat-finger from
 * buying two hundred labels in one click. */
export const MAX_PACKAGES_PER_SHIPMENT = 50;

/**
 * One package per case, using each product's own parcel. Items whose SKU is
 * not in the catalog (a retail order, or a product deleted after the sale)
 * fall back to the global parcel — and if nothing matches at all, the order
 * still ships as `fallbackBoxCount` boxes of the global parcel, which is the
 * pre-catalog behaviour.
 */
export function packagesForOrder(
  items: PackableItem[],
  parcelBySku: Map<string, ProductParcel>,
  fallbackParcel: ProductParcel,
  fallbackBoxCount: number,
): ShipmentPackage[] {
  const packages: ShipmentPackage[] = [];
  const unmatched: PackableItem[] = [];
  let matchedAny = false;

  for (const item of items) {
    const parcel = parcelBySku.get(item.sku);
    const count = Math.max(0, Math.floor(item.quantity || 0));
    if (!count) continue;
    if (!parcel) {
      unmatched.push(item);
      continue;
    }
    matchedAny = true;
    for (let index = 0; index < count; index += 1) {
      packages.push({
        description: item.name || "Bread",
        weightOz: parcel.boxWeightOz,
        lengthIn: parcel.boxLengthIn,
        widthIn: parcel.boxWidthIn,
        heightIn: parcel.boxHeightIn,
      });
    }
  }

  if (matchedAny) {
    // A wholesale order (something matched), so every quantity is a case
    // count — a line whose product was deleted after the sale still ships
    // one fallback box per case rather than being silently left behind.
    for (const item of unmatched) {
      const count = Math.max(0, Math.floor(item.quantity || 0));
      for (let index = 0; index < count; index += 1) {
        packages.push({
          description: item.name || "Bread",
          weightOz: fallbackParcel.boxWeightOz,
          lengthIn: fallbackParcel.boxLengthIn,
          widthIn: fallbackParcel.boxWidthIn,
          heightIn: fallbackParcel.boxHeightIn,
        });
      }
    }
  }

  if (!matchedAny) {
    const count = Math.min(MAX_PACKAGES_PER_SHIPMENT, Math.max(1, Math.floor(fallbackBoxCount || 1)));
    for (let index = 0; index < count; index += 1) {
      packages.push({
        description: "Bread",
        weightOz: fallbackParcel.boxWeightOz,
        lengthIn: fallbackParcel.boxLengthIn,
        widthIn: fallbackParcel.boxWidthIn,
        heightIn: fallbackParcel.boxHeightIn,
      });
    }
    return packages;
  }

  return packages.slice(0, MAX_PACKAGES_PER_SHIPMENT);
}

/** Total billed weight in whole pounds, the way UPS rounds it. */
export function totalWeightLbs(packages: ShipmentPackage[]) {
  return packages.reduce((total, box) => total + Math.max(1, Math.ceil(box.weightOz / 16)), 0);
}
