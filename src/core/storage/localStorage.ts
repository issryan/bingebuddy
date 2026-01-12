import type { AppState } from "../types/state";
import { LEGACY_STORAGE_KEY, stateStorageKey } from "./keys";

export function loadState(): AppState {
  if (typeof window === "undefined") {
    return { shows: [] };
  }

  // NEW (user-scoped) key
  const raw = localStorage.getItem(stateStorageKey());

  if (raw) {
    try {
      return JSON.parse(raw) as AppState;
    } catch {
      return { shows: [] };
    }
  }

  // Fallback: if you had old data under the legacy key, we can still read it once.
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacy) return { shows: [] };

  try {
    return JSON.parse(legacy) as AppState;
  } catch {
    return { shows: [] };
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(stateStorageKey(), JSON.stringify(state));
}

/**
 * Helper: wipe saved data for the CURRENT scope (current user, or guest).
 */
export function clearState(): void {
  if (typeof window === "undefined") return;

  localStorage.removeItem(stateStorageKey());
}