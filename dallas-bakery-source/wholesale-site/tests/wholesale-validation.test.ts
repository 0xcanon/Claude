import assert from "node:assert/strict";
import test from "node:test";

import {
  clean,
  cleanWebsite,
  isAllowedBusinessType,
  isMailboxAddress,
  normalizeAddress,
} from "../app/wholesale-validation.ts";

test("normalizes common address abbreviations without hiding suite differences", () => {
  const long = normalizeAddress({
    street: "1200 Main Street",
    street2: "Suite 210",
    city: "Dallas",
    state: "tx",
    zip: "75201",
  });
  const short = normalizeAddress({
    street: "1200 Main St.",
    street2: "STE #210",
    city: "DALLAS",
    state: "TX",
    zip: "75201",
  });
  const otherSuite = normalizeAddress({
    street: "1200 Main St",
    street2: "STE 310",
    city: "Dallas",
    state: "TX",
    zip: "75201",
  });

  assert.equal(long, short);
  assert.notEqual(long, otherSuite);
});

test("accepts only relevant buyer categories", () => {
  assert.equal(isAllowedBusinessType("restaurant"), true);
  assert.equal(isAllowedBusinessType("food-distributor"), true);
  assert.equal(isAllowedBusinessType("furniture-store"), false);
  assert.equal(isAllowedBusinessType("retail-customer"), false);
});

test("rejects mailbox delivery addresses", () => {
  assert.equal(isMailboxAddress("P.O. Box 42"), true);
  assert.equal(isMailboxAddress("PMB 108"), true);
  assert.equal(isMailboxAddress("2643 Manana Dr"), false);
});

test("allows only http and https website links", () => {
  assert.equal(cleanWebsite("javascript:alert(1)"), "");
  assert.equal(cleanWebsite("ftp://example.com"), "");
  assert.equal(cleanWebsite("https://example.com/store"), "https://example.com/store");
});

test("trims and bounds public text fields", () => {
  assert.equal(clean("  bakery  "), "bakery");
  assert.equal(clean("123456", 4), "1234");
});
