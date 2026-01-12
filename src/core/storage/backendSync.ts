import type { AppState } from "@/core/types/state";
import type { Show } from "@/core/types/show";
import { supabase } from "@/lib/supabaseClient";

export type WantToWatchItem = {
  id: string;
  title: string;
  tmdbId: number | null;
  posterPath: string | null;
  year: string | null;
  genres: string[];
  overview: string;
};

export type BackendResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function normalizeGenres(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((g): g is string => typeof g === "string");
  }
  // Some DB setups store JSON as string
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((g): g is string => typeof g === "string");
      }
    } catch {
      return [];
    }
  }
  return [];
}

function mapShowRowToShow(row: any): Show {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    createdAt: typeof row.created_at === "string" ? Date.parse(row.created_at) : Number(row.created_at ?? Date.now()),
    tmdbId: typeof row.tmdb_id === "number" ? row.tmdb_id : row.tmdb_id ? Number(row.tmdb_id) : null,
    posterPath: typeof row.poster_path === "string" ? row.poster_path : null,
    year: typeof row.year === "string" ? row.year : row.year != null ? String(row.year) : null,
    genres: normalizeGenres(row.genres),
    overview: typeof row.overview === "string" ? row.overview : "",
  };
}

export type CloudPayload = {
  state: AppState;
  wantToWatch: WantToWatchItem[];
};

/**
 * Load ranked + want-to-watch from Supabase.
 * This returns data ready to be written into localStorage (or used in-memory).
 */
export async function loadFromBackend(userId: string): Promise<BackendResult<CloudPayload>> {
  try {
    // 1) Ranked order
    const rankedRes = await supabase
      .from("ranked_shows")
      .select("tmdb_id, rank_position")
      .eq("user_id", userId)
      .order("rank_position", { ascending: true });

    if (rankedRes.error) {
      return { ok: false, error: rankedRes.error.message };
    }

    const rankedRows = rankedRes.data ?? [];
    const rankedTmdbIds = rankedRows
      .map((r: any) => (typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id)))
      .filter((n: number) => Number.isFinite(n));

    // 2) Want to watch
    const wtwRes = await supabase
      .from("want_to_watch")
      .select("tmdb_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (wtwRes.error) {
      return { ok: false, error: wtwRes.error.message };
    }

    const wtwRows = wtwRes.data ?? [];
    const wtwTmdbIdsRaw = wtwRows
      .map((r: any) => (typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id)))
      .filter((n: number) => Number.isFinite(n));

    // IMPORTANT: If a show is ranked, it should not appear in Want to Watch.
    // This protects against stale backend rows and prevents “ranked -> reappears in want to watch”.
    const rankedSet = new Set<number>(rankedTmdbIds);
    const wtwTmdbIds = wtwTmdbIdsRaw.filter((id: number) => !rankedSet.has(id));

    // 3) Fetch show metadata for everything we reference
    const allTmdbIds = Array.from(new Set([...rankedTmdbIds, ...wtwTmdbIds]));

    let showMap = new Map<number, Show>();

    if (allTmdbIds.length > 0) {
      const showsRes = await supabase
        .from("shows")
        .select("id, tmdb_id, title, poster_path, year, genres, overview, created_at")
        .eq("user_id", userId)
        .in("tmdb_id", allTmdbIds);

      if (showsRes.error) {
        return { ok: false, error: showsRes.error.message };
      }

      for (const row of showsRes.data ?? []) {
        const show = mapShowRowToShow(row);
        if (typeof show.tmdbId === "number" && Number.isFinite(show.tmdbId)) {
          showMap.set(show.tmdbId, show);
        }
      }
    }

    // 4) Build ranked shows list in correct order
    const rankedShows: Show[] = rankedTmdbIds
      .map((id) => showMap.get(id))
      .filter((s): s is Show => !!s);

    // 5) Build want-to-watch list with metadata
    const wantToWatch = wtwTmdbIds
      .map((id): WantToWatchItem | null => {
        const s = showMap.get(id);
        if (!s) return null;

        return {
          id: s.id,
          title: s.title,
          tmdbId: s.tmdbId ?? null,
          posterPath: s.posterPath ?? null,
          year: s.year ?? null,
          genres: s.genres ?? [],
          overview: s.overview ?? "",
        };
      })
      .filter((x): x is WantToWatchItem => x !== null);

    return {
      ok: true,
      data: {
        state: { shows: rankedShows },
        wantToWatch,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Save local ranked + want-to-watch into Supabase.
 * Ratings are NOT stored — order is the truth.
 */
export async function saveToBackend(
  userId: string,
  state: AppState,
  wantToWatch: WantToWatchItem[]
): Promise<BackendResult<true>> {
  try {
    const ranked = state.shows ?? [];

    // Only sync shows that have tmdbId (Sprint 4+ world)
    const rankedWithTmdb = ranked.filter((s: any) => typeof s.tmdbId === "number" && Number.isFinite(s.tmdbId));
    const rankedTmdbSet = new Set<number>(
      rankedWithTmdb
        .map((s: any) => s.tmdbId)
        .filter((n: any) => typeof n === "number" && Number.isFinite(n))
    );

    const wtwWithTmdb = wantToWatch
      .filter((s) => typeof s.tmdbId === "number" && Number.isFinite(s.tmdbId))
      // Never allow a ranked item to remain in want-to-watch
      .filter((s) => !rankedTmdbSet.has(s.tmdbId as number));

    const all = [...rankedWithTmdb, ...wtwWithTmdb];

    // 1) Upsert metadata into `shows`
    if (all.length > 0) {
      const showRows = all.map((s: any) => ({
        user_id: userId,
        tmdb_id: s.tmdbId,
        title: s.title,
        poster_path: s.posterPath ?? null,
        year: s.year ?? null,
        genres: s.genres ?? [],
        overview: s.overview ?? "",
      }));

      const upsertShows = await supabase
        .from("shows")
        .upsert(showRows, { onConflict: "user_id,tmdb_id" });

      if (upsertShows.error) {
        return { ok: false, error: upsertShows.error.message };
      }
    }

    // 2) Ranked order: replace by deleting then inserting (simple + reliable)
    const delRanked = await supabase
      .from("ranked_shows")
      .delete()
      .eq("user_id", userId);

    if (delRanked.error) {
      return { ok: false, error: delRanked.error.message };
    }

    if (rankedWithTmdb.length > 0) {
      const rankedRows = rankedWithTmdb.map((s: any, idx: number) => ({
        user_id: userId,
        tmdb_id: s.tmdbId,
        rank_position: idx,
      }));

      const insRanked = await supabase.from("ranked_shows").insert(rankedRows);
      if (insRanked.error) {
        return { ok: false, error: insRanked.error.message };
      }
    }

    // 3) Want to watch: replace too
    const delWtw = await supabase
      .from("want_to_watch")
      .delete()
      .eq("user_id", userId);

    if (delWtw.error) {
      return { ok: false, error: delWtw.error.message };
    }

    if (wtwWithTmdb.length > 0) {
      const wtwRows = wtwWithTmdb.map((s) => ({
        user_id: userId,
        tmdb_id: s.tmdbId,
      }));

      const insWtw = await supabase.from("want_to_watch").insert(wtwRows);
      if (insWtw.error) {
        return { ok: false, error: insWtw.error.message };
      }
    }

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
