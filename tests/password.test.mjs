import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { test } from "node:test";
import {
  BCRYPT_ROUNDS,
  bcryptCostFactor,
  hashPassword,
  isBcryptHash,
  needsPasswordRehash,
  validatePassword,
  verifyPassword,
} from "../lib/password.js";

test("hashPassword stores bcrypt hashes with the configured cost factor", () => {
  const hash = hashPassword("SecurePass123!");
  assert.ok(isBcryptHash(hash));
  assert.equal(bcryptCostFactor(hash), BCRYPT_ROUNDS);
  assert.ok(verifyPassword("SecurePass123!", hash));
  assert.equal(verifyPassword("WrongPass123!", hash), false);
});

test("validatePassword rejects short passwords", () => {
  assert.throws(() => validatePassword("short"), /at least 8 characters/);
});

test("verifyPassword uses constant-time bcrypt comparison", () => {
  const hash = hashPassword("AnotherPass123!");
  assert.equal(verifyPassword("AnotherPass123!", hash), true);
  assert.equal(verifyPassword("", hash), false);
  assert.equal(verifyPassword("AnotherPass123!", ""), false);
});

test("needsPasswordRehash flags weak or non-bcrypt hashes", () => {
  const currentHash = hashPassword("UpgradeMe123!");
  assert.equal(needsPasswordRehash(currentHash), false);

  const weakHash = bcrypt.hashSync("UpgradeMe123!", 8);
  assert.equal(needsPasswordRehash(weakHash), true);
  assert.equal(needsPasswordRehash("not-a-bcrypt-hash"), true);
});
