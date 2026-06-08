const ACTIVE_USER_KEY = "littlecode_active_user_id";
const CONVERSATION_KEY_PREFIX = "littlecode_conversation_";

export function detectActiveUserSwitch(userId) {
  if (typeof window === "undefined") {
    return false;
  }

  const next = userId == null ? "" : String(userId);
  let previous = "";

  try {
    previous = window.localStorage.getItem(ACTIVE_USER_KEY) || "";
    if (next) {
      window.localStorage.setItem(ACTIVE_USER_KEY, next);
    } else {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
    }
  } catch {
    return false;
  }

  return Boolean(previous && next && previous !== next);
}

export function resetUserScopedClientState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const keysToRemove = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(CONVERSATION_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures in private browsing or restricted contexts.
  }
}
