import assert from "node:assert/strict";
import test from "node:test";

import {
  createApplicationTrackingToken,
  hashApplicationTrackingToken,
  readBearerToken,
} from "../app/application-tracking.ts";

test("creates high-entropy URL-safe buyer tracking tokens", () => {
  const first = createApplicationTrackingToken();
  const second = createApplicationTrackingToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
});

test("accepts only a bounded bearer tracking token", () => {
  const token = createApplicationTrackingToken();
  assert.equal(readBearerToken(`Bearer ${token}`), token);
  assert.equal(readBearerToken(token), "");
  assert.equal(readBearerToken("Bearer short"), "");
});

test("hashes tracking credentials without storing the raw token", async () => {
  const token = "a".repeat(43);
  const secret = "test-secret-that-is-at-least-thirty-two-bytes";
  const first = await hashApplicationTrackingToken(token, secret);
  const second = await hashApplicationTrackingToken(token, secret);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.ok(!first.includes(token));
  assert.equal(await hashApplicationTrackingToken(token, "short"), "");
});
