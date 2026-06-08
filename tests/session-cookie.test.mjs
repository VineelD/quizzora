import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getClearSessionCookieOptions,
  getSessionCookieOptions,
  isRequestSecure,
  shouldUseSecureCookie,
} from "../lib/session-cookie.js";

test("isRequestSecure reads x-forwarded-proto from IIS", () => {
  const request = {
    url: "http://127.0.0.1:3000/api/auth/login",
    headers: new Headers({
      "x-forwarded-proto": "https",
      host: "quizzora.org",
    }),
  };

  assert.equal(isRequestSecure(request), true);
});

test("isRequestSecure trusts APP_BASE_URL host behind localhost rewrite", () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://quizzora.org";

  try {
    const request = {
      url: "http://127.0.0.1:3000/api/auth/login",
      headers: new Headers({
        host: "quizzora.org",
      }),
    };

    assert.equal(isRequestSecure(request), true);
  } finally {
    if (previous === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previous;
    }
  }
});

test("isRequestSecure ignores wrong x-forwarded-proto when public host matches APP_BASE_URL", () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://quizzora.org";

  try {
    const request = {
      url: "http://127.0.0.1:3000/api/auth/login",
      headers: new Headers({
        host: "quizzora.org",
        "x-forwarded-proto": "http",
      }),
    };

    assert.equal(isRequestSecure(request), true);
  } finally {
    if (previous === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previous;
    }
  }
});

test("shouldUseSecureCookie is false on plain HTTP", () => {
  const previous = process.env.AUTH_COOKIE_SECURE;
  delete process.env.AUTH_COOKIE_SECURE;

  try {
    const request = {
      url: "http://quizzora.org/api/auth/login",
      headers: new Headers({
        "x-forwarded-proto": "http",
      }),
    };

    assert.equal(shouldUseSecureCookie(request), false);
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = previous;
    }
  }
});

test("AUTH_COOKIE_SECURE=true always marks cookies Secure when APP_BASE_URL is HTTPS", () => {
  const previousSecure = process.env.AUTH_COOKIE_SECURE;
  const previousBase = process.env.APP_BASE_URL;
  process.env.AUTH_COOKIE_SECURE = "true";
  process.env.APP_BASE_URL = "https://quizzora.org";

  try {
    const request = {
      url: "http://127.0.0.1:3000/api/auth/login",
      headers: new Headers({
        host: "quizzora.org",
        "x-forwarded-proto": "http",
      }),
    };

    assert.equal(shouldUseSecureCookie(request), true);
  } finally {
    if (previousSecure === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = previousSecure;
    }
    if (previousBase === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previousBase;
    }
  }
});

test("getClearSessionCookieOptions matches login cookie flags with zero maxAge", () => {
  const previous = process.env.APP_BASE_URL;
  process.env.APP_BASE_URL = "https://quizzora.org";

  try {
    const request = {
      url: "https://quizzora.org/api/auth/logout",
      headers: new Headers({
        host: "quizzora.org",
        "x-forwarded-proto": "https",
      }),
    };

    const loginOptions = getSessionCookieOptions(request);
    const clearOptions = getClearSessionCookieOptions(request);

    assert.equal(clearOptions.path, loginOptions.path);
    assert.equal(clearOptions.secure, loginOptions.secure);
    assert.equal(clearOptions.sameSite, loginOptions.sameSite);
    assert.equal(clearOptions.httpOnly, loginOptions.httpOnly);
    assert.equal(clearOptions.maxAge, 0);
    assert.ok(clearOptions.expires instanceof Date);
  } finally {
    if (previous === undefined) {
      delete process.env.APP_BASE_URL;
    } else {
      process.env.APP_BASE_URL = previous;
    }
  }
});

test("AUTH_COOKIE_SECURE=false never marks cookies Secure", () => {
  const previous = process.env.AUTH_COOKIE_SECURE;
  process.env.AUTH_COOKIE_SECURE = "false";

  try {
    const request = {
      url: "https://quizzora.org/api/auth/login",
      headers: new Headers({
        "x-forwarded-proto": "https",
      }),
    };

    assert.equal(shouldUseSecureCookie(request), false);
  } finally {
    if (previous === undefined) {
      delete process.env.AUTH_COOKIE_SECURE;
    } else {
      process.env.AUTH_COOKIE_SECURE = previous;
    }
  }
});
