// src/core/storage/scope.ts
const ACTIVE_USER_KEY = "bingebuddy.activeUserId";

/**
 * We keep the currently signed-in user id in localStorage so our storage layer
 * can stay synchronous (your ranking/state logic is sync).
 */
export function setActiveUserId(userId: string | null): void {
  if (typeof window === "undefined") return;

  try {
    if (!userId) {
      localStorage.removeItem(ACTIVE_USER_KEY);
    } else {
      localStorage.setItem(ACTIVE_USER_KEY, userId);
    }
  } catch {
    // ignore
  }
}

export function getActiveUserId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const v = localStorage.getItem(ACTIVE_USER_KEY);
    if (!v) return null;
    return v;
  } catch {
    return null;
  }
}