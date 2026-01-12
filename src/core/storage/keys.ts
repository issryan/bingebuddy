// src/core/storage/keys.ts
import { getActiveUserId } from "./scope";

// Base keys (human readable, stable)
const STATE_BASE = "bingebuddy.state";
const WTW_BASE = "bingebuddy.wantToWatch";

// Legacy key (your old one) — we keep it here so we can optionally clean it up
export const LEGACY_STORAGE_KEY = "bingebuddy:v1";

function scoped(base: string): string {
  const userId = getActiveUserId();
  // Signed out / guest mode
  if (!userId) return `${base}.local`;
  // Signed in (user-scoped)
  return `${base}.${userId}`;
}

export function stateStorageKey(): string {
  return scoped(STATE_BASE);
}

export function wantToWatchStorageKey(): string {
  return scoped(WTW_BASE);
}