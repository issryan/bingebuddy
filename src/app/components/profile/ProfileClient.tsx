"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRankedShows, getState, setState } from "@/core/logic/state";
import { supabase } from "@/lib/supabaseClient";
import {
  safeGetWantToWatch,
  safeSetWantToWatch,
  type WantToWatchItem as StorageWantToWatchItem,
} from "@/core/storage/wantToWatchStorage";

// For backend sync we require overview to always be a string (never undefined)
type NormalizedWantToWatchItem = StorageWantToWatchItem & { overview: string };
import {
  loadFromBackend,
  saveToBackend,
} from "@/core/storage/backendSync";

function formatShortDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}


function formatMonthYear(dateLike: string | number): string {
  try {
    const d = typeof dateLike === "string" ? new Date(dateLike) : new Date(dateLike);
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

function ratingTextClass(rating: number | null): string {
  if (rating === null || !Number.isFinite(rating)) return "text-white/70";
  if (rating >= 7) return "text-green-400";
  if (rating >= 4) return "text-yellow-300";
  return "text-red-400";
}

function migratedFlagKey(userId: string): string {
  return `bingebuddy.migratedToCloud.${userId}`;
}

function getMigratedToCloud(userId: string): boolean {
  try {
    return localStorage.getItem(migratedFlagKey(userId)) === "1";
  } catch {
    return false;
  }
}

function setMigratedToCloud(userId: string): void {
  try {
    localStorage.setItem(migratedFlagKey(userId), "1");
  } catch {
    // ignore
  }
}

function clearLegacyLocalState(): void {
  try {
    localStorage.removeItem("bingebuddy:v1");
  } catch {
    // ignore
  }
}

function normalizeWantToWatch(items: unknown): NormalizedWantToWatchItem[] {
  if (!Array.isArray(items)) return [];

  return items
    .filter((x) => x && typeof (x as any).id === "string" && typeof (x as any).title === "string")
    .map((x) => {
      const it = x as any;
      return {
        id: it.id,
        title: typeof it.title === "string" ? it.title : "",
        tmdbId: typeof it.tmdbId === "number" ? it.tmdbId : null,
        posterPath: typeof it.posterPath === "string" ? it.posterPath : null,
        year: typeof it.year === "string" ? it.year : null,
        genres: Array.isArray(it.genres) ? it.genres.filter((g: unknown) => typeof g === "string") : [],
        // IMPORTANT: keep overview always as a string so TS + sync stay consistent
        overview: typeof it.overview === "string" ? it.overview : "",
      } as NormalizedWantToWatchItem;
    });
}

export default function ProfileClient() {
  const [hydrated, setHydrated] = useState(false);
  const [rankedCount, setRankedCount] = useState(0);
  const [wantToWatchCount, setWantToWatchCount] = useState(0);

  const [topShow, setTopShow] = useState<{ title: string; rating: number } | null>(null);
  const [bottomShow, setBottomShow] = useState<{ title: string; rating: number } | null>(null);
  const [newestShow, setNewestShow] = useState<{ title: string; dateLabel: string } | null>(null);
  const [daysSinceFirst, setDaysSinceFirst] = useState<number | null>(null);
  const [topGenres, setTopGenres] = useState<Array<{ genre: string; count: number }>>([]);

  const [username, setUsername] = useState<string | null>(null);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [friendsCount, setFriendsCount] = useState<number>(0);
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [myEvents, setMyEvents] = useState<
    Array<{
      id: string;
      tmdbId: number;
      showTitle: string;
      derivedRating: number | null;
      createdAt: string;
    }>
  >([]);
  const [myEventsLoading, setMyEventsLoading] = useState(false);
  const [myEventsError, setMyEventsError] = useState<string | null>(null);

  // Delete account (danger zone)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Always show the *current* derived rating from the live ranked list
  const ratingByTmdbId = useMemo(() => {
    const ranked = getRankedShows(getState());
    const map = new Map<number, number>();
    for (const s of ranked as any[]) {
      const id = typeof s.tmdbId === "number" ? s.tmdbId : null;
      if (id !== null && Number.isFinite(id)) {
        map.set(id, s.rating);
      }
    }
    return map;
  }, [rankedCount]);

  function recomputeStatsFromLocal() {
    const ranked = getRankedShows(getState());
    setRankedCount(ranked.length);

    const wtw = safeGetWantToWatch();
    setWantToWatchCount(wtw.length);

    if (ranked.length === 0) {
      setTopShow(null);
      setBottomShow(null);
      setNewestShow(null);
      setDaysSinceFirst(null);
      setTopGenres([]);
      return;
    }

    // Top + bottom (based on ranked order)
    setTopShow({ title: ranked[0].title, rating: ranked[0].rating });
    const last = ranked[ranked.length - 1];
    setBottomShow({ title: last.title, rating: last.rating });

    // Newest ranked (based on createdAt)
    const newest = ranked.reduce(
      (best, cur) => (cur.createdAt > best.createdAt ? cur : best),
      ranked[0]
    );
    setNewestShow({ title: newest.title, dateLabel: formatShortDate(newest.createdAt) });

    // Days since first log
    const earliest = ranked.reduce(
      (best, cur) => (cur.createdAt < best.createdAt ? cur : best),
      ranked[0]
    );
    const days = Math.floor((Date.now() - earliest.createdAt) / (1000 * 60 * 60 * 24));
    setDaysSinceFirst(Math.max(0, days));

    // Top genres (from ranked shows metadata)
    const counts = new Map<string, number>();
    for (const s of ranked) {
      const genres = Array.isArray((s as any).genres) ? ((s as any).genres as string[]) : [];
      for (const g of genres) {
        if (!g || typeof g !== "string") continue;
        counts.set(g, (counts.get(g) ?? 0) + 1);
      }
    }

    const sorted = Array.from(counts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    setTopGenres(sorted);
  }

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setHydrated(false);
      const sessionRes = await supabase.auth.getSession();
      const user = sessionRes.data.session?.user ?? null;

      setCurrentUserId(user?.id ?? null);

      if (user) {
        try {
          const profRes = await supabase
            .from("profiles")
            .select("username, created_at")
            .eq("user_id", user.id)
            .maybeSingle();

          const uname = (profRes.data as any)?.username;
          setUsername(typeof uname === "string" && uname.trim() ? uname.trim() : null);

          const created = (profRes.data as any)?.created_at;
          setMemberSince(created ? formatMonthYear(created) : null);

          const friendsRes = await supabase
            .from("friendships")
            .select("user_low", { count: "exact", head: true })
            .or(`user_low.eq.${user.id},user_high.eq.${user.id}`);

          setFriendsCount(friendsRes.count ?? 0);

          // Load *my* recent activity (profile feed)
          setMyEventsLoading(true);
          setMyEventsError(null);
          const evRes = await supabase
            .from("activity_events")
            .select("id, tmdb_id, show_title, derived_rating, created_at")
            .eq("actor_user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(20);

          if (evRes.error) {
            setMyEventsError(evRes.error.message);
            setMyEvents([]);
          } else {
            const rows = (evRes.data ?? []).map((r: any) => ({
              id: String(r.id),
              tmdbId: typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id),
              showTitle: String(r.show_title ?? ""),
              derivedRating:
                typeof r.derived_rating === "number"
                  ? r.derived_rating
                  : r.derived_rating != null
                    ? Number(r.derived_rating)
                    : null,
              createdAt: String(r.created_at),
            }));
            setMyEvents(rows);
          }
          setMyEventsLoading(false);
        } catch {
          setUsername(null);
          setMemberSince(null);
          setFriendsCount(0);
          setMyEvents([]);
          setMyEventsError(null);
          setMyEventsLoading(false);
        }
      } else {
        setUsername(null);
        setMemberSince(null);
        setFriendsCount(0);
        setCurrentUserId(null);
        setMyEvents([]);
        setMyEventsError(null);
        setMyEventsLoading(false);
      }

      if (!user) {
        recomputeStatsFromLocal();
        if (!cancelled) setHydrated(true);
        return;
      }

      const loaded = await loadFromBackend(user.id);
      if (cancelled) return;

      if (loaded.ok) {
        const cloud = loaded.data;
        const cloudHasAnyData =
          (cloud.state.shows?.length ?? 0) > 0 ||
          (cloud.wantToWatch?.length ?? 0) > 0;

        if (cloudHasAnyData) {
          // Cloud wins (authoritative)
          setState(cloud.state);
          safeSetWantToWatch(normalizeWantToWatch(cloud.wantToWatch));
          setMigratedToCloud(user.id);
          clearLegacyLocalState();
        } else {
          // Cloud empty: if local has data and we haven't migrated yet, push local up once.
          const alreadyMigrated = getMigratedToCloud(user.id);
          if (!alreadyMigrated) {
            const localRanked = getState().shows ?? [];
            const localWTW = normalizeWantToWatch(safeGetWantToWatch());
            const localHasAnyData = localRanked.length > 0 || localWTW.length > 0;

            if (localHasAnyData) {
              const saved = await saveToBackend(user.id, { shows: localRanked }, localWTW as any);
              if (!cancelled && saved.ok) {
                setMigratedToCloud(user.id);
                clearLegacyLocalState();
              }
            } else {
              // Nothing to migrate; mark so we don't keep checking
              setMigratedToCloud(user.id);
            }
          }
        }
      }

      recomputeStatsFromLocal();
      if (!cancelled) setHydrated(true);
    }

    void run();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void run();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);


  const handleShareProfile = useCallback(async () => {
    try {
      setCopyMsg(null);
      const u = username ? username.trim() : "";
      if (!u) {
        setCopyMsg("Set a username first.");
        return;
      }
      const url = `${window.location.origin}/u/${encodeURIComponent(u)}`;
      await navigator.clipboard.writeText(url);
      setCopyMsg("Profile link copied!");
      window.setTimeout(() => setCopyMsg(null), 1500);
    } catch {
      setCopyMsg("Couldn’t copy link.");
      window.setTimeout(() => setCopyMsg(null), 1500);
    }
  }, [username]);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      // Keep it simple and reliable
      window.location.href = "/login";
    }
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    setDeleteError(null);

    // Simple, explicit confirmation phrase
    if (deleteInput.trim().toLowerCase() !== "delete") {
      setDeleteError('Type "delete" to confirm.');
      return;
    }

    try {
      setDeleteLoading(true);

      // Grab an access token so the API route can identify the caller
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes.data.session?.access_token ?? null;

      if (!token) {
        setDeleteError("Not authenticated.");
        return;
      }

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: "delete" }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDeleteError(
          typeof json?.error === "string" && json.error
            ? json.error
            : "Couldn’t delete your account. Try again."
        );
        return;
      }

      // Sign out + bounce to login (session will be invalid anyway)
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }

      window.location.href = "/login";
    } catch {
      setDeleteError("Couldn’t delete your account. Try again.");
    } finally {
      setDeleteLoading(false);
    }
  }, [deleteInput]);

  return (
    <div className="space-y-6">
      {/* Header (mobile-first) */}
      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar (placeholder for now) */}
            <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
              <span className="text-base sm:text-lg font-semibold text-white/70">
                {(username ?? "?").slice(0, 1).toUpperCase()}
              </span>
            </div>

            <div className="min-w-0">
              <div className="text-base sm:text-lg font-semibold truncate">@{username ?? "guest"}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/50">
                {memberSince ? <span>Member since {memberSince}</span> : null}
                {memberSince ? <span className="text-white/20">•</span> : null}
              </div>
            </div>
          </div>

          {/* Actions (stack on mobile) */}
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => {
                // Future sprint: open edit modal
              }}
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs sm:text-sm font-medium text-white/80 hover:bg-white/10"
              title="Profile editing comes later"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={handleShareProfile}
              className="rounded-xl bg-white text-black px-3 py-2 text-xs sm:text-sm font-semibold hover:opacity-90"
            >
              Share
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs sm:text-sm font-medium text-white/80 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>

        {copyMsg ? <div className="mt-3 text-xs text-white/60">{copyMsg}</div> : null}


        {/* Stats bar (seamless) */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/friends"
              className="flex-1 text-center hover:opacity-90"
            >
              <div className="text-lg sm:text-xl font-semibold leading-none">
                {hydrated ? friendsCount : "—"}
              </div>
              <div className="mt-1 text-[11px] sm:text-xs text-white/50">Friends</div>
            </Link>

            <div className="h-8 w-px bg-white/10" aria-hidden="true" />

            <Link
              href="/my-list"
              className="flex-1 text-center hover:opacity-90"
            >
              <div className="text-lg sm:text-xl font-semibold leading-none">
                {hydrated ? rankedCount : "—"}
              </div>
              <div className="mt-1 text-[11px] sm:text-xs text-white/50">Ranked</div>
            </Link>

            <div className="h-8 w-px bg-white/10" aria-hidden="true" />

            <Link
              href="/my-list?tab=watch"
              className="flex-1 text-center hover:opacity-90"
            >
              <div className="text-lg sm:text-xl font-semibold leading-none">
                {hydrated ? wantToWatchCount : "—"}
              </div>
              <div className="mt-1 text-[11px] sm:text-xs text-white/50">Want</div>
            </Link>
          </div>
        </div>
      </section>

      {/* Insights */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Days since first log</div>
          <div className="mt-1 text-3xl font-semibold">
            {!hydrated ? "—" : daysSinceFirst === null ? "—" : daysSinceFirst}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Top show</div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">{!hydrated ? "—" : topShow ? topShow.title : "—"}</div>
              <div className="mt-1 text-xs text-white/50">Highest-rated right now</div>
            </div>

            {topShow ? (
              <div className="shrink-0">
                <div className="h-10 w-10 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                  <span className={`text-sm font-semibold ${ratingTextClass(topShow.rating)}`}>{
                    Number.isFinite(topShow.rating) ? topShow.rating.toFixed(1) : "—"
                  }</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Lowest show</div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold truncate">{!hydrated ? "—" : bottomShow ? bottomShow.title : "—"}</div>
              <div className="mt-1 text-xs text-white/50">Lowest-rated right now</div>
            </div>

            {bottomShow ? (
              <div className="shrink-0">
                <div className="h-10 w-10 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                  <span className={`text-sm font-semibold ${ratingTextClass(bottomShow.rating)}`}>{
                    Number.isFinite(bottomShow.rating) ? bottomShow.rating.toFixed(1) : "—"
                  }</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Top genres */}
      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white/90">Top genres</h2>
          <div className="text-xs text-white/40">Based on ranked shows</div>
        </div>

        {!hydrated ? (
          <div className="mt-3 text-sm text-white/50">—</div>
        ) : topGenres.length === 0 ? (
          <div className="mt-3 text-sm text-white/50">—</div>
        ) : (
          <ol className="mt-4 space-y-2">
            {topGenres.slice(0, 5).map((g) => (
              <li key={g.genre} className="flex items-center justify-between gap-3">
                <span className="text-sm text-white/80 truncate">{g.genre}</span>
                <span className="text-xs text-white/50 shrink-0">{g.count}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* My activity */}
      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white/90">My activity</h2>
          <div className="text-xs text-white/40">Latest ranks</div>
        </div>

        {!hydrated || myEventsLoading ? (
          <div className="mt-4 text-sm text-white/60">Loading…</div>
        ) : myEventsError ? (
          <div className="mt-4 text-sm text-red-300">{myEventsError}</div>
        ) : myEvents.length === 0 ? (
          <div className="mt-4 text-sm text-white/50">No activity yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {myEvents.map((e) => {
              const current = ratingByTmdbId.get(e.tmdbId);
              const effectiveRating = typeof current === "number" && Number.isFinite(current) ? current : e.derivedRating;
              const ratingText = effectiveRating === null || effectiveRating === undefined ? "—" : effectiveRating.toFixed(1);
              const dateLabel = formatShortDate(Date.parse(e.createdAt));

              return (
                <a
                  key={e.id}
                  href={`/show/${e.tmdbId}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 hover:bg-white/[0.06]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white/90 truncate">{e.showTitle}</div>
                    <div className="mt-1 text-xs text-white/50">{dateLabel}</div>
                  </div>

                  <div className="shrink-0">
                    <div className="h-10 w-10 rounded-full border border-white/15 bg-white/5 flex items-center justify-center">
                      <span className={`text-sm font-semibold ${ratingTextClass(effectiveRating ?? null)}`}>{ratingText}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </section>

      {/* Danger zone */}
      <section className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-red-200">Danger zone</h2>
            <p className="mt-1 text-sm text-white/60">Delete your account and all your data (ranked shows, want to watch, friendships, activity).</p>
          </div>

          <button
            type="button"
            onClick={() => {
              setDeleteOpen(true);
              setDeleteInput("");
              setDeleteError(null);
            }}
            className="rounded-xl bg-red-500/15 border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/20"
          >
            Delete account
          </button>
        </div>

        {deleteOpen ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4">
            <div className="text-sm text-white/80 font-medium">This can’t be undone.</div>
            <div className="mt-1 text-xs text-white/60">
              Type <span className="font-semibold text-white">delete</span> to confirm.
            </div>

            <div className="mt-3 flex flex-col sm:flex-row gap-3">
              <input
                value={deleteInput}
                onChange={(e) => {
                  setDeleteInput(e.target.value);
                  if (deleteError) setDeleteError(null);
                }}
                placeholder='Type "delete"'
                className="flex-1 rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (deleteLoading) return;
                    setDeleteOpen(false);
                    setDeleteInput("");
                    setDeleteError(null);
                  }}
                  className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={deleteLoading}
                  className="rounded-xl bg-red-500 text-black px-4 py-3 text-sm font-semibold disabled:opacity-60"
                >
                  {deleteLoading ? "Deleting…" : "Confirm delete"}
                </button>
              </div>
            </div>

            {deleteError ? <div className="mt-3 text-sm text-red-200">{deleteError}</div> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}



