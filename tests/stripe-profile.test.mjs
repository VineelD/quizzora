import assert from "node:assert/strict";

import { test } from "node:test";

process.env.OPERATOR_LEGAL_NAME = "Mr Vineel Davuluri";
delete process.env.OPERATOR_ABN;

const stripeProfile = await import("../lib/stripe-profile.js");
const operator = await import("../lib/operator.js");

test("operator display line is legal name only (no ABN by default)", () => {
  assert.equal(operator.operatorDisplayLine(), "Mr Vineel Davuluri");
});

test("stripe copy uses product name and legal operator without ABN", () => {
  assert.equal(stripeProfile.stripeProductDescription(), "Quizzora voluntary support (Mr Vineel Davuluri)");
  assert.equal(stripeProfile.stripePortalHeadline(), "Quizzora — Mr Vineel Davuluri");
  assert.ok(stripeProfile.stripeProductDescription().includes("Vineel Davuluri"));
  assert.ok(!stripeProfile.stripeProductDescription().includes("ABN"));
});

test("statement descriptor is capped for Stripe", () => {
  assert.ok(stripeProfile.stripeStatementDescriptor().length <= 22);
  assert.equal(stripeProfile.stripeStatementDescriptor(), "QUIZZORA");
});

test("dashboard checklist includes legal operator name without ABN when unset", () => {
  const checklist = stripeProfile.stripeDashboardChecklist({ appBaseUrl: "https://quizzora.org" });
  const serialized = JSON.stringify(checklist);
  assert.ok(serialized.includes("Mr Vineel Davuluri"));
  assert.ok(!serialized.includes("41833153799"));
  assert.ok(serialized.includes("Quizzora"));
});
