import type { AppState } from "../types/state";
import { STORAGE_KEY } from "./keys";

export function loadState(): AppState {
  if (typeof window === "undefined") {
    return { shows: [] };
  }

  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return { shows: [] };
  }

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return { shows: [] };
  }
}

export function saveState(state: AppState): void {
  if (typeof window === "undefined") return;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/**
 * Dev helper: wipe saved data so we can restart testing.
 */
export function clearState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}