import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_PACKAGES_PER_SHIPMENT,
  packagesForOrder,
  totalWeightLbs,
} from "../app/parcel-packing.ts";

const FALLBACK = { boxWeightOz: 432, boxLengthIn: 24, boxWidthIn: 16, boxHeightIn: 6 };

const PARCELS = new Map([
  ["WS-BARBARI-25", { boxWeightOz: 432, boxLengthIn: 24, boxWidthIn: 16, boxHeightIn: 6 }],
  // A lighter, smaller mini case the owner set up in /admin.
  ["WS-MINI-50", { boxWeightOz: 240, boxLengthIn: 18, boxWidthIn: 12, boxHeightIn: 6 }],
]);

test("each case ships as its own box with its product's weight and size", () => {
  const packages = packagesForOrder(
    [
      { sku: "WS-BARBARI-25", name: "Barbari — Case of 25", quantity: 2 },
      { sku: "WS-MINI-50", name: "Mini — Case of 50", quantity: 1 },
    ],
    PARCELS,
    FALLBACK,
    3,
  );
  assert.equal(packages.length, 3);
  assert.equal(packages[0]!.weightOz, 432);
  assert.equal(packages[0]!.description, "Barbari — Case of 25");
  assert.equal(packages[2]!.weightOz, 240);
  assert.equal(packages[2]!.lengthIn, 18);
  // UPS is billed 27 + 27 + 15 lb, not three of anything global.
  assert.equal(totalWeightLbs(packages), 27 + 27 + 15);
});

test("an order with no matching products still ships as the recorded box count", () => {
  const packages = packagesForOrder(
    [{ sku: "RETAIL-LOAF", name: "Loaf", quantity: 12 }],
    PARCELS,
    FALLBACK,
    2,
  );
  assert.equal(packages.length, 2);
  assert.ok(packages.every((box) => box.weightOz === 432));
});

test("a deleted product's cases still ship, as fallback boxes", () => {
  // The order is wholesale (Barbari matched), so the deleted product's two
  // cases pack as two global-parcel boxes rather than being left behind.
  const packages = packagesForOrder(
    [
      { sku: "WS-BARBARI-25", name: "Barbari", quantity: 1 },
      { sku: "WS-GONE-25", name: "Gone", quantity: 2 },
    ],
    PARCELS,
    FALLBACK,
    3,
  );
  assert.equal(packages.length, 3);
  assert.equal(packages.filter((box) => box.description === "Gone").length, 2);
  assert.ok(packages.filter((box) => box.description === "Gone").every((box) => box.weightOz === 432));
});

test("one shipment can never explode past the package cap", () => {
  const packages = packagesForOrder(
    [{ sku: "WS-BARBARI-25", name: "Barbari", quantity: 500 }],
    PARCELS,
    FALLBACK,
    500,
  );
  assert.equal(packages.length, MAX_PACKAGES_PER_SHIPMENT);
});
