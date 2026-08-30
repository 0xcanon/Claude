import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_SUPPORT_MESSAGE_LENGTH,
  SUPPORT_REASONS,
  supportPriority,
  supportReason,
  validateSupportCase,
  waitingFor,
} from "../app/support-cases-rules.ts";

test("every reason a buyer can pick is fully described", () => {
  assert.ok(SUPPORT_REASONS.length >= 5);
  for (const option of SUPPORT_REASONS) {
    assert.ok(option.label.length > 0, `${option.key} has no label`);
    assert.ok(option.prompt.length > 0, `${option.key} has no prompt`);
    assert.equal(supportReason(option.key)?.key, option.key);
  }
  assert.equal(supportReason("not-a-reason"), null);
});

test("a case about a specific order must name one", () => {
  // "Damaged" only means something against an order.
  assert.match(
    String(validateSupportCase({ reason: "damaged", message: "Two cases were crushed on arrival." })),
    /Choose which order/,
  );
  assert.equal(
    validateSupportCase({
      reason: "damaged",
      message: "Two cases were crushed on arrival.",
      orderId: "order-1",
    }),
    null,
  );
  // A billing question does not.
  assert.equal(
    validateSupportCase({ reason: "billing", message: "Invoice DB-1042 shows the wrong PO." }),
    null,
  );
});

test("a message has to say something actionable", () => {
  assert.match(String(validateSupportCase({ reason: "other", message: "" })), /a little more/);
  assert.match(String(validateSupportCase({ reason: "other", message: "help" })), /a little more/);
  assert.match(
    String(validateSupportCase({ reason: "other", message: "x".repeat(MAX_SUPPORT_MESSAGE_LENGTH + 1) })),
    /call us instead/,
  );
});

test("an unknown reason is refused rather than filed as other", () => {
  assert.match(String(validateSupportCase({ reason: "", message: "something is wrong here" })), /Pick what the problem/);
});

test("anything that costs the buyer money goes to the top of the queue", () => {
  assert.equal(supportPriority("damaged", 0), "now");
  assert.equal(supportPriority("short", 0), "now");
  assert.equal(supportPriority("wrong-item", 0), "now");
  // A missing box loses an account even though no refund is owed yet.
  assert.equal(supportPriority("late", 0), "now");
});

test("anything else escalates as the buyer waits", () => {
  assert.equal(supportPriority("billing", 0), "soon");
  assert.equal(supportPriority("billing", 5), "today");
  assert.equal(supportPriority("billing", 25), "now");
});

test("waiting time reads the way a person would say it", () => {
  assert.equal(waitingFor(0), "just now");
  assert.equal(waitingFor(1), "1 hour ago");
  assert.equal(waitingFor(5), "5 hours ago");
  assert.equal(waitingFor(30), "yesterday");
  assert.equal(waitingFor(72), "3 days ago");
  assert.equal(waitingFor(-4), "just now");
});
