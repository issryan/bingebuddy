import type { Show } from "../types/show";
import { wantToWatchStorageKey } from "./keys";

export type WantToWatchItem = {
  id: string;
  title: string;
  tmdbId: number | null;
  posterPath: string | null;
  year: string | null;
  genres: string[];
  // optional extra fields (safe if present in future)
  overview?: string;
  createdAt?: number;
};

export function safeGetWantToWatch(): WantToWatchItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(wantToWatchStorageKey());
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.title === "string")
      .map((x) => {
        const tmdbId = typeof x.tmdbId === "number" ? x.tmdbId : null;
        const posterPath = typeof x.posterPath === "string" ? x.posterPath : null;
        const year = typeof x.year === "string" ? x.year : null;
        const genres = Array.isArray(x.genres)
          ? x.genres.filter((g: unknown) => typeof g === "string")
          : [];

        const overview = typeof x.overview === "string" ? x.overview : undefined;
        const createdAt = typeof x.createdAt === "number" ? x.createdAt : undefined;

        return {
          id: x.id,
          title: x.title,
          tmdbId,
          posterPath,
          year,
          genres,
          overview,
          createdAt,
        } as WantToWatchItem;
      });
  } catch {
    return [];
  }
}

export function safeSetWantToWatch(items: WantToWatchItem[]) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(wantToWatchStorageKey(), JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function makeWantToWatchId(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = crypto as any;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : String(Date.now());
}

export function removeFromWantToWatchByTitle(title: string) {
  const clean = title.trim().toLowerCase();
  if (!clean) return;

  const current = safeGetWantToWatch();
  const next = current.filter((x) => x.title.trim().toLowerCase() !== clean);
  safeSetWantToWatch(next);
}

export function removeFromWantToWatchByTmdbId(tmdbId: number) {
  if (!Number.isFinite(tmdbId)) return;

  const current = safeGetWantToWatch();
  const next = current.filter((x) => x.tmdbId !== tmdbId);
  safeSetWantToWatch(next);
}

export function isTitleAlreadyInWantToWatch(title: string): boolean {
  const clean = title.trim().toLowerCase();
  if (!clean) return false;

  const current = safeGetWantToWatch();
  return current.some((x) => x.title.trim().toLowerCase() === clean);
}

export function isTmdbAlreadyInWantToWatch(tmdbId: number): boolean {
  if (!Number.isFinite(tmdbId)) return false;

  const current = safeGetWantToWatch();
  return current.some((x) => x.tmdbId === tmdbId);
}

/**
 * Helper: return true if the title is already ranked.
 * (We use title matching for now; later we can switch to tmdbId-only.)
 */
export function isTitleAlreadyRanked(rankedShows: Show[], title: string): boolean {
  const clean = title.trim().toLowerCase();
  if (!clean) return false;

  return rankedShows.some((s: any) => String(s?.title ?? "").trim().toLowerCase() === clean);
}

/**
 * Adds an item to Want To Watch (does not allow duplicates).
 * Returns a user-friendly error string if it can't add.
 */
export function addToWantToWatch(
  rankedShows: Show[],
  item: Omit<WantToWatchItem, "id"> & { id?: string }
): { ok: true } | { ok: false; error: string } {
  const cleanTitle = String(item.title ?? "").trim();
  if (!cleanTitle) {
    return { ok: false, error: "Enter a show title to save it." };
  }

  if (isTitleAlreadyRanked(rankedShows, cleanTitle)) {
    return { ok: false, error: "That show is already ranked — no need to save it." };
  }

  const current = safeGetWantToWatch();
  const selectedId = typeof item.tmdbId === "number" ? item.tmdbId : null;

  const exists = selectedId
    ? current.some((x) => x.tmdbId === selectedId)
    : current.some((x) => x.title.trim().toLowerCase() === cleanTitle.toLowerCase());

  if (exists) {
    return { ok: false, error: "That show is already in your Want to Watch list." };
  }

  const nextItem: WantToWatchItem = {
    id: item.id ?? makeWantToWatchId(),
    title: cleanTitle,
    tmdbId: selectedId,
    posterPath: item.posterPath ?? null,
    year: item.year ?? null,
    genres: Array.isArray(item.genres) ? item.genres : [],
    overview: typeof item.overview === "string" ? item.overview : undefined,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : undefined,
  };

  safeSetWantToWatch([...current, nextItem]);
  return { ok: true };
}
