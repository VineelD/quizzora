import bcrypt from "bcryptjs";

export const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function validatePassword(password) {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
}

export function isBcryptHash(passwordHash) {
  return BCRYPT_HASH_PATTERN.test(String(passwordHash || ""));
}

export function bcryptCostFactor(passwordHash) {
  const match = String(passwordHash || "").match(/^\$2[aby]\$(\d{2})\$/);
  return match ? Number(match[1]) : null;
}

export function needsPasswordRehash(passwordHash, rounds = BCRYPT_ROUNDS) {
  if (!isBcryptHash(passwordHash)) {
    return true;
  }
  const cost = bcryptCostFactor(passwordHash);
  return cost == null || cost < rounds;
}

export function hashPassword(password) {
  validatePassword(password);
  return bcrypt.hashSync(String(password), BCRYPT_ROUNDS);
}

export function verifyPassword(password, passwordHash) {
  const hash = String(passwordHash || "");
  if (!hash) {
    return false;
  }
  return bcrypt.compareSync(String(password || ""), hash);
}
