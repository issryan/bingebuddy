import type { AppState } from "../types/state";
import type { RankedShow, Show } from "../types/show";
import { loadState, saveState } from "../storage/localStorage";
import { insertByComparison, withDerivedRatings, type Preference } from "./ranking";

/**
 * A temporary in-memory session while we place a NEW show.
 * We DO NOT store this in localStorage in v1 (it's just UI flow state).
 */
export type CompareSession = {
  // The show we are trying to place into the ranked order
  newShow: Show;

  // Search bounds for insertion (like binary search)
  low: number;  // inclusive
  high: number; // exclusive

  // Which index the app is currently asking the user to compare against
  compareIndex: number;
};

/**
 * Check if a title already exists in the current state (case-insensitive).
 * This prevents duplicate entries like "The Boys" and "the boys".
 */
function titleExists(state: AppState, title: string): boolean {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return false;

  return state.shows.some((s) => s.title.trim().toLowerCase() === normalized);
}

/**
 * Create a brand-new Show object.
 * IMPORTANT: In our comparison model, we do NOT store rating on the show.
 * The list order is the truth; ratings are derived later.
 */
export function createShow(title: string): Show {
  // Use crypto.randomUUID if available (modern browsers), otherwise fallback.
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return {
    id,
    title: title.trim(),
    createdAt: Date.now(),
  };
}

/**
 * Load the current saved state from localStorage.
 * If nothing is saved yet, you'll get: { shows: [] }.
 */
export function getState(): AppState {
  return loadState();
}

/**
 * Save a state object to localStorage.
 * We keep this as a single function so all writes are consistent.
 */
export function setState(state: AppState): void {
  saveState(state);
}

/**
 * Add the very first show.
 * If there are already shows, we DO NOT add here (comparison is required).
 */
export function addFirstShow(title: string): AppState {
  const state = getState();

  // Guard: don't allow duplicates (case-insensitive)
  if (titleExists(state, title)) return state;

  // If a show already exists, we don't allow a "first show" add.
  // The UI should send the user into the comparison flow instead.
  if (state.shows.length > 0) return state;

  const newShow = createShow(title);

  const next: AppState = {
    shows: [newShow], // first show is automatically #1
  };

  setState(next);
  return next;
}

/**
 * For Sprint 1, we keep "comparison selection" very simple:
 * we compare the new show against the TOP ranked show (index 0).
 *
 * Later, we can improve this (binary-search style comparisons, etc.).
 */
export function getDefaultComparisonShowId(state: AppState): string | null {
  if (state.shows.length === 0) return null;
  return state.shows[0].id;
}

/**
 * Apply ONE comparison and insert the new show either above or below
 * the comparison show.
 *
 * - preference === "new"      -> new show goes ABOVE the comparison show
 * - preference === "existing" -> new show goes BELOW the comparison show
 */
export function addShowByComparison(
  title: string,
  comparisonShowId: string,
  preference: Preference
): AppState {
  const state = getState();

  // Guard: don't allow duplicates (case-insensitive)
  if (titleExists(state, title)) return state;

  const newShow = createShow(title);

  const ordered = insertByComparison(
    state.shows,
    newShow,
    comparisonShowId,
    preference
  );

  const next: AppState = { shows: ordered };

  setState(next);
  return next;
}

/**
 * Convert our stored ordered list into a display-ready ranked list:
 * - same order as stored
 * - each show gets a derived rating (0–10, 1 decimal)
 */
export function getRankedShows(state: AppState): RankedShow[] {
  return withDerivedRatings(state.shows);
}

/**
 * Start a comparison session for inserting a new show.
 * The app chooses the first comparison target automatically (middle of the list).
 */
export function startComparisonSession(title: string): CompareSession | null {
  const state = getState();

  // Guard: don't allow duplicates (case-insensitive)
  if (titleExists(state, title)) return null;

  // If there are no shows, we don't need comparisons.
  // The UI should call addFirstShow() instead.
  if (state.shows.length === 0) return null;

  const newShow = createShow(title);

  // We search for the insertion position between [0, shows.length]
  const low = 0;
  const high = state.shows.length;

  // Ask the user to compare against the "middle" show first
  const compareIndex = Math.floor((low + high) / 2);

  return { newShow, low, high, compareIndex };
}

/**
 * Apply one user answer to the session and either:
 * - return an updated session (more comparisons needed), OR
 * - finalize: insert the show, save state, and return null (session ends)
 */
export function applyComparisonAnswer(
  session: CompareSession,
  preference: Preference
): CompareSession | null {
  const state = getState();

  // Safety: if list changed somehow, restart session cleanly
  if (state.shows.length === 0) return null;

  const { newShow } = session;
  let { low, high, compareIndex } = session;

  /**
   * preference meanings (relative to the comparison show at compareIndex):
   * - "new"      -> new show is better => it should go ABOVE compareIndex
   * - "existing" -> existing is better => new should go BELOW compareIndex
   */
  if (preference === "new") {
    // search the upper portion (above compareIndex)
    high = compareIndex;
  } else {
    // search the lower portion (below compareIndex)
    low = compareIndex + 1;
  }

  // When low === high, we found the insertion position.
  if (low >= high) {
    const nextOrdered = [...state.shows];
    nextOrdered.splice(low, 0, newShow); // insert at the exact position

    const nextState: AppState = { shows: nextOrdered };
    setState(nextState);

    // Session done
    return null;
  }

  // Otherwise, ask the next "middle" comparison
  compareIndex = Math.floor((low + high) / 2);

  return { newShow, low, high, compareIndex };
}