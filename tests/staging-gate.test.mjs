import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  isStagingGateEnabled,
  isStagingGatePathAllowed,
} from "../lib/staging-gate.js";

const envSnapshot = { ...process.env };

afterEach(() => {
  process.env = { ...envSnapshot };
});

test("staging gate is enabled only on staging with a password", () => {
  process.env.APP_ENV = "staging";
  process.env.STAGING_GATE_PASSWORD = "secret";
  assert.equal(isStagingGateEnabled(), true);

  delete process.env.STAGING_GATE_PASSWORD;
  assert.equal(isStagingGateEnabled(), false);

  process.env.APP_ENV = "production";
  process.env.STAGING_GATE_PASSWORD = "secret";
  assert.equal(isStagingGateEnabled(), false);
});

test("auth API routes bypass the staging gate", () => {
  assert.equal(isStagingGatePathAllowed("/api/auth/login"), true);
  assert.equal(isStagingGatePathAllowed("/api/auth/forgot-password"), true);
  assert.equal(isStagingGatePathAllowed("/api/auth/verify"), true);
});

test("non-auth app routes remain gated", () => {
  assert.equal(isStagingGatePathAllowed("/"), false);
  assert.equal(isStagingGatePathAllowed("/admin"), false);
  assert.equal(isStagingGatePathAllowed("/api/me"), false);
});
