import assert from "node:assert/strict";

import { test } from "node:test";



process.env.OPERATOR_LEGAL_NAME = "Mr Vineel Davuluri";

process.env.OPERATOR_ABN = "41 833 153 799";



const stripeProfile = await import("../lib/stripe-profile.js");

const operator = await import("../lib/operator.js");



test("operator display line includes legal name and ABN", () => {

  assert.equal(operator.operatorDisplayLine(), "Mr Vineel Davuluri (ABN 41 833 153 799)");

});



test("stripe copy uses product name and legal operator with ABN", () => {

  assert.equal(

    stripeProfile.stripeProductDescription(),

    "Quizzora school subscription (Mr Vineel Davuluri (ABN 41 833 153 799))",

  );

  assert.equal(

    stripeProfile.stripePortalHeadline(),

    "Quizzora — Mr Vineel Davuluri (ABN 41 833 153 799)",

  );

  assert.ok(stripeProfile.stripeProductDescription().includes("Vineel Davuluri"));

  assert.ok(stripeProfile.stripeProductDescription().includes("ABN 41 833 153 799"));

});



test("statement descriptor is capped for Stripe", () => {

  assert.ok(stripeProfile.stripeStatementDescriptor().length <= 22);

  assert.equal(stripeProfile.stripeStatementDescriptor(), "QUIZZORA");

});



test("dashboard checklist includes legal operator name and ABN", () => {

  const checklist = stripeProfile.stripeDashboardChecklist({ appBaseUrl: "https://quizzora.org" });

  const serialized = JSON.stringify(checklist);

  assert.ok(serialized.includes("Mr Vineel Davuluri"));

  assert.ok(serialized.includes("41833153799"));

  assert.ok(serialized.includes("Quizzora"));

});


