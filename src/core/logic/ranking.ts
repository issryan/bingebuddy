import type { RankedShow, Show } from "../types/show";
import { ratingForIndex } from "./rating";

export type Preference = "new" | "existing";

export function insertByComparison(
  ranked: Show[],
  newShow: Show,
  comparisonShowId: string,
  preference: Preference
): Show[] {
  const idx = ranked.findIndex((s) => s.id === comparisonShowId);
  if (idx === -1) return ranked;

  const insertAt = preference === "new" ? idx : idx + 1;
  const next = [...ranked];
  next.splice(insertAt, 0, newShow);
  return next;
}

export function withDerivedRatings(ordered: Show[]): RankedShow[] {
  return ordered.map((s, i) => ({
    ...s,
    rating: ratingForIndex(i, ordered.length),
  }));
}