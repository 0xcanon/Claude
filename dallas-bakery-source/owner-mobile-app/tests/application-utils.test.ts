import assert from "node:assert/strict";
import test from "node:test";

import {
  addressOf,
  countApplications,
  filterApplications,
  normalizeSignal,
} from "../src/lib/application-utils.ts";
import type { WholesaleApplication } from "../src/types.ts";

function application(overrides: Partial<WholesaleApplication> = {}): WholesaleApplication {
  return {
    id: "app-1",
    businessName: "Crescent International Market",
    businessType: "grocery",
    contactName: "Samira Khan",
    email: "samira@example.com",
    phone: "2145550182",
    website: "",
    street: "1250 Market Center Blvd",
    street2: "Suite 140",
    city: "Dallas",
    state: "TX",
    zip: "75207",
    multipleLocations: true,
    locationCount: 4,
    additionalMarkets: "Plano, Richardson, Frisco",
    screeningStatus: "auto_matched",
    addressScreening: "verified-commercial",
    categoryScreening: "verified-food-business",
    standardizedAddress: "",
    matchedBusiness: "Crescent International Market",
    status: "pending",
    ownerNotes: "",
    decidedBy: "",
    decidedAt: null,
    createdAt: "2026-08-24 21:42:00",
    updatedAt: "2026-08-24 21:42:00",
    ...overrides,
  };
}

test("counts statuses and multi-location businesses", () => {
  const counts = countApplications([
    application(),
    application({ id: "app-2", status: "approved", multipleLocations: false }),
    application({ id: "app-3", status: "declined" }),
  ]);
  assert.deepEqual(counts, {
    pending: 1,
    approved: 1,
    declined: 1,
    multiLocation: 2,
    total: 3,
  });
});

test("filters by status and searchable business fields", () => {
  const records = [
    application(),
    application({ id: "app-2", businessName: "Anatolia Kitchen", city: "Addison", status: "approved" }),
  ];
  assert.equal(filterApplications(records, "pending", "crescent").length, 1);
  assert.equal(filterApplications(records, "approved", "addison").length, 1);
  assert.equal(filterApplications(records, "pending", "addison").length, 0);
});

test("formats delivery address and screening labels", () => {
  assert.equal(addressOf(application()), "1250 Market Center Blvd, Suite 140, Dallas, TX 75207");
  assert.equal(normalizeSignal("verified-food_business"), "verified food business");
});
