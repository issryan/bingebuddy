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
  overview?: string;
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
      .select("tmdb_id, rank_position, derived_rating")
      .eq("user_id", userId)
      .order("rank_position", { ascending: true });

    if (rankedRes.error) {
      return { ok: false, error: rankedRes.error.message };
    }

    const rankedRows = rankedRes.data ?? [];
    const rankedRatingByTmdbId = new Map<number, number>();
    for (const r of rankedRows as any[]) {
      const id = typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id);
      const ratingRaw = r.derived_rating;
      const rating =
        typeof ratingRaw === "number" ? ratingRaw : ratingRaw != null ? Number(ratingRaw) : NaN;

      if (Number.isFinite(id) && Number.isFinite(rating)) {
        rankedRatingByTmdbId.set(id, rating);
      }
    }
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
          // Attach the latest derived rating for ranked items (prevents NaN in UI)
          const r = rankedRatingByTmdbId.get(show.tmdbId);
          if (typeof r === "number" && Number.isFinite(r)) {
            (show as any).rating = r;
          }

          showMap.set(show.tmdbId, show);
        }
      }
    }

    // 4) Build ranked shows list in correct order
    const rankedShows: Show[] = rankedTmdbIds
      .map((id) => {
        const s = showMap.get(id);
        if (!s) return null;

        // Safety: if rating wasn't attached above for any reason, attach here too.
        const r = rankedRatingByTmdbId.get(id);
        if (typeof r === "number" && Number.isFinite(r)) {
          (s as any).rating = r;
        }

        return s;
      })
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
 * We store `derived_rating` for display, but order is still the source of truth.
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
        derived_rating: typeof s.rating === "number" && Number.isFinite(s.rating) ? s.rating : null,
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

    // 4) Cleanup: keep Supabase consistent when users remove/unrank items.
    // `shows` is a per-user metadata cache. We prune rows that are no longer referenced
    // by either Ranked or Want-to-Watch.
    // We also prune the user's own rank_completed activity events for removed items.

    const keepTmdbIds = Array.from(
      new Set<number>([
        ...rankedWithTmdb
          .map((s: any) => (typeof s.tmdbId === "number" ? s.tmdbId : Number(s.tmdbId)))
          .filter((n: number) => Number.isFinite(n)),
        ...wtwWithTmdb
          .map((s: any) => (typeof s.tmdbId === "number" ? s.tmdbId : Number(s.tmdbId)))
          .filter((n: number) => Number.isFinite(n)),
      ])
    );

    if (keepTmdbIds.length === 0) {
      // User has no ranked + no want-to-watch -> remove all cached metadata + their rank_completed events
      const delShowsAll = await supabase.from("shows").delete().eq("user_id", userId);
      if (delShowsAll.error) return { ok: false, error: delShowsAll.error.message };

      const delEventsAll = await supabase
        .from("activity_events")
        .delete()
        .eq("actor_user_id", userId)
        .eq("event_type", "rank_completed");
      if (delEventsAll.error) return { ok: false, error: delEventsAll.error.message };
    } else {
      // Remove cached show metadata not referenced anymore
      const delShowsStale = await supabase
        .from("shows")
        .delete()
        .eq("user_id", userId)
        .not("tmdb_id", "in", `(${keepTmdbIds.join(",")})`);
      if (delShowsStale.error) return { ok: false, error: delShowsStale.error.message };

      // Remove this user's rank_completed events for shows that are no longer in ranked or want-to-watch
      const delEventsStale = await supabase
        .from("activity_events")
        .delete()
        .eq("actor_user_id", userId)
        .eq("event_type", "rank_completed")
        .not("tmdb_id", "in", `(${keepTmdbIds.join(",")})`);
      if (delEventsStale.error) return { ok: false, error: delEventsStale.error.message };
    }

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

// -----------------------------
// Sprint 6 — Social Foundation
// -----------------------------

export type ProfileRow = {
  userId: string;
  username: string;
  createdAt?: string;
  updatedAt?: string;
};

export type FriendRequestRow = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
};

export type FriendshipRow = {
  userIdA: string;
  userIdB: string;
  createdAt: string;
};

export type ActivityEventRow = {
  id: string;
  actorUserId: string;
  eventType: "rank_completed";
  tmdbId: number;
  showTitle: string;
  posterPath: string | null;
  year: string | null;
  rankPosition: number | null;
  derivedRating: number | null;
  createdAt: string;
};

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function isValidUsername(username: string): boolean {
  // Minimal rules: 3–20 chars, lowercase letters/numbers/underscore
  // (Keep it simple and predictable for now.)
  return /^[a-z0-9_]{3,20}$/.test(username);
}

/**
 * Create/update the current user's username.
 * Table: public.profiles (user_id PK, username unique)
 */
export async function upsertUsername(
  userId: string,
  username: string
): Promise<BackendResult<true>> {
  try {
    const normalized = normalizeUsername(username);

    if (!isValidUsername(normalized)) {
      return {
        ok: false,
        error: "Username must be 3–20 characters and only use letters, numbers, or _",
      };
    }

    const res = await supabase
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          username: normalized,
        },
        { onConflict: "user_id" }
      );

    if (res.error) return { ok: false, error: res.error.message };

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Lookup a user id by exact username (case-insensitive).
 * Returns null if not found.
 */
export async function findUserIdByUsername(
  username: string
): Promise<BackendResult<string | null>> {
  try {
    const normalized = normalizeUsername(username);

    const res = await supabase
      .from("profiles")
      .select("user_id")
      .eq("username", normalized)
      .maybeSingle();

    if (res.error) return { ok: false, error: res.error.message };
    if (!res.data) return { ok: true, data: null };

    return { ok: true, data: String((res.data as any).user_id) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Send a friend request from -> to.
 */
export async function sendFriendRequest(
  fromUserId: string,
  toUserId: string
): Promise<BackendResult<true>> {
  try {
    if (fromUserId === toUserId) {
      return { ok: false, error: "You can't add yourself." };
    }

    const res = await supabase.from("friend_requests").insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      status: "pending",
    });

    if (res.error) return { ok: false, error: res.error.message };

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * List incoming pending requests for the current user.
 */
export async function listIncomingFriendRequests(
  userId: string
): Promise<BackendResult<FriendRequestRow[]>> {
  try {
    const res = await supabase
      .from("friend_requests")
      .select("id, from_user_id, to_user_id, status, created_at")
      .eq("to_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (res.error) return { ok: false, error: res.error.message };

    const rows: FriendRequestRow[] = (res.data ?? []).map((r: any) => ({
      id: String(r.id),
      fromUserId: String(r.from_user_id),
      toUserId: String(r.to_user_id),
      status: r.status,
      createdAt: String(r.created_at),
    }));

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Accept a pending request.
 * This will:
 * - mark request accepted
 * - create a friendship row
 */
export async function acceptFriendRequest(
  requestId: string
): Promise<BackendResult<true>> {
  try {
    // Update request status first
    const upd = await supabase
      .from("friend_requests")
      .update({ status: "accepted" })
      .eq("id", requestId);

    if (upd.error) return { ok: false, error: upd.error.message };

    // Fetch request to know the pair
    const req = await supabase
      .from("friend_requests")
      .select("from_user_id, to_user_id")
      .eq("id", requestId)
      .maybeSingle();

    if (req.error) return { ok: false, error: req.error.message };
    if (!req.data) return { ok: false, error: "Request not found." };

    const a = String((req.data as any).from_user_id);
    const b = String((req.data as any).to_user_id);

    // Insert friendship (server-side RLS/constraints should prevent duplicates)
    const ins = await supabase.from("friendships").insert({
      user_id_a: a,
      user_id_b: b,
    });

    if (ins.error) return { ok: false, error: ins.error.message };

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function declineFriendRequest(
  requestId: string
): Promise<BackendResult<true>> {
  try {
    const upd = await supabase
      .from("friend_requests")
      .update({ status: "declined" })
      .eq("id", requestId);

    if (upd.error) return { ok: false, error: upd.error.message };

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Create an activity event when a rank is completed.
 * Friends-only visibility is enforced by RLS.
 */
export async function createRankCompletedEvent(args: {
  actorUserId: string;
  tmdbId: number;
  showTitle: string;
  posterPath?: string | null;
  year?: string | null;
  rankPosition?: number | null;
  derivedRating?: number | null;
}): Promise<BackendResult<true>> {
  try {
    const res = await supabase.from("activity_events").insert({
      actor_user_id: args.actorUserId,
      event_type: "rank_completed",
      tmdb_id: args.tmdbId,
      show_title: args.showTitle,
      poster_path: args.posterPath ?? null,
      year: args.year ?? null,
      rank_position: args.rankPosition ?? null,
      derived_rating: args.derivedRating ?? null,
    });

    if (res.error) return { ok: false, error: res.error.message };

    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Load a friends-only feed.
 * RLS should allow: your own events + your friends' events.
 */
export async function loadFriendsFeed(
  userId: string,
  opts?: { limit?: number; before?: string }
): Promise<BackendResult<ActivityEventRow[]>> {
  try {
    void userId;

    const limit = opts?.limit ?? 30;
    const before = opts?.before;

    let q = supabase
      .from("activity_events")
      .select(
        "id, actor_user_id, event_type, tmdb_id, show_title, poster_path, year, rank_position, derived_rating, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    // Cursor pagination: fetch older than the last item we have
    if (before) {
      q = q.lt("created_at", before);
    }

    const res = await q;
    if (res.error) return { ok: false, error: res.error.message };

    const rows: ActivityEventRow[] = (res.data ?? []).map((r: any) => ({
      id: String(r.id),
      actorUserId: String(r.actor_user_id),
      eventType: r.event_type,
      tmdbId: typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id),
      showTitle: String(r.show_title ?? ""),
      posterPath: typeof r.poster_path === "string" ? r.poster_path : null,
      year: typeof r.year === "string" ? r.year : r.year != null ? String(r.year) : null,
      rankPosition:
        typeof r.rank_position === "number"
          ? r.rank_position
          : r.rank_position != null
            ? Number(r.rank_position)
            : null,
      derivedRating:
        typeof r.derived_rating === "number"
          ? r.derived_rating
          : r.derived_rating != null
            ? Number(r.derived_rating)
            : null,
      createdAt: String(r.created_at),
    }));

    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Delete the signed-in user's own activity events for a given tmdbId.
 * This is used when a user removes/unranks a show and wants the feed cleaned up.
 * Requires RLS policy that allows: delete where actor_user_id = auth.uid().
 */
export async function deleteOwnActivityEventsForTmdbId(
  actorUserId: string,
  tmdbId: number
): Promise<BackendResult<true>> {
  try {
    if (!actorUserId) return { ok: false, error: "Missing user." };
    if (!Number.isFinite(tmdbId)) return { ok: false, error: "Invalid tmdbId." };

    const res = await supabase
      .from("activity_events")
      .delete()
      .eq("actor_user_id", actorUserId)
      .eq("tmdb_id", tmdbId);

    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, data: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}