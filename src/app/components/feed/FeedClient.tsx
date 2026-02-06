"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadFriendsFeed } from "@/core/storage/backendSync";

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";
const PAGE_SIZE = 30;

function posterUrl(path: string | null | undefined, size: "w92" | "w154" = "w92"): string | null {
  if (!path) return null;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

function timeAgo(iso: string) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function FeedClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [events, setEvents] = useState<any[]>([]); // all fetched events
  const [page, setPage] = useState(1); // pages shown (PAGE_SIZE per page)
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [usernamesById, setUsernamesById] = useState<Record<string, string>>({});

  async function loadActorUsernames(rows: any[]) {
    const ids = Array.from(new Set(rows.map((r) => r.actorUserId).filter(Boolean)));
    if (ids.length === 0) return;

    const profRes = await supabase
      .from("profiles")
      .select("user_id, username")
      .in("user_id", ids);

    if (profRes.error) return;

    setUsernamesById((prev) => {
      const next = { ...prev };
      for (const p of profRes.data ?? []) {
        next[String((p as any).user_id)] = String((p as any).username ?? "");
      }
      return next;
    });
  }

  async function refresh() {
    setLoading(true);
    setErr(null);
    setPage(1);
    setHasMore(true);

    const sess = await supabase.auth.getSession();
    const user = sess.data.session?.user ?? null;
    if (!user) {
      router.push("/login");
      return;
    }

    // Fetch only the first chunk initially
    const feedRes = await loadFriendsFeed(user.id, { limit: PAGE_SIZE });
    if (!feedRes.ok) {
      setErr(feedRes.error);
      setLoading(false);
      return;
    }

    const rows = feedRes.data ?? [];
    setEvents(rows);
    setHasMore(rows.length === PAGE_SIZE);

    await loadActorUsernames(rows);

    setLoading(false);
  }

  async function loadMore() {
    if (loadingMore || loading || !hasMore) return;

    setLoadingMore(true);
    setErr(null);

    const nextPage = page + 1;
    const targetCount = nextPage * PAGE_SIZE;

    const sess = await supabase.auth.getSession();
    const user = sess.data.session?.user ?? null;
    if (!user) {
      router.push("/login");
      return;
    }

    // If we already have enough events fetched, just reveal more.
    if (events.length >= targetCount) {
      setPage(nextPage);
      setLoadingMore(false);
      return;
    }

    // Otherwise, refetch with a larger limit (simple pagination without cursors)
    const feedRes = await loadFriendsFeed(user.id, { limit: targetCount });
    if (!feedRes.ok) {
      setErr(feedRes.error);
      setLoadingMore(false);
      return;
    }

    const rows = feedRes.data ?? [];
    setEvents(rows);
    setPage(nextPage);
    setHasMore(rows.length === targetCount);

    await loadActorUsernames(rows);

    setLoadingMore(false);
  }

  useEffect(() => {
    void refresh();
    // optional: refresh when tab refocuses
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleEvents = useMemo(() => events.slice(0, page * PAGE_SIZE), [events, page]);
  const hasItems = useMemo(() => visibleEvents.length > 0, [visibleEvents]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-white/60">
          {loading ? "Loading…" : hasItems ? "Latest activity" : "No activity yet."}
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-white/10 border border-white/15 px-3 py-2 text-sm font-medium hover:bg-white/15"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {err}
        </div>
      ) : null}

      {!loading && !hasItems ? (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 text-white/60">
          Add a friend and rank a show to see events here.
        </div>
      ) : null}

      <div className="space-y-2">
        {visibleEvents.map((e) => {
          const username = usernamesById[e.actorUserId] || "user";
          const img = posterUrl(e.posterPath, "w92");
          const rating = typeof e.derivedRating === "number" ? e.derivedRating : null;

          return (
            <div
              key={e.id}
              className="rounded-2xl border border-white/15 bg-white/[0.03] p-4 flex items-center justify-between gap-3"
            >
              <button
                type="button"
                className="flex items-center gap-3 min-w-0 text-left hover:opacity-90"
                onClick={() => router.push(`/show/${e.tmdbId}`)}
              >
                {img ? (
                  <img src={img} alt="" className="w-10 h-14 rounded bg-white/10 object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-14 rounded bg-white/10 shrink-0" />
                )}

                <div className="min-w-0">
                  <div className="text-sm text-white/60">
                    <button
                      type="button"
                      className="text-white/90 hover:underline"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        router.push(`/u/${encodeURIComponent(username)}`);
                      }}
                    >
                      @{username}
                    </button>{" "}
                    ranked
                  </div>

                  <div className="font-semibold truncate">{e.showTitle}</div>
                  <div className="mt-0.5 text-xs text-white/50">
                    {timeAgo(e.createdAt)}
                    {e.year ? ` • ${e.year}` : ""}
                  </div>
                </div>
              </button>

              {rating !== null ? (
                <div
                  className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full border border-white/20 bg-white/5 text-sm font-semibold"
                  title={`Rating ${rating.toFixed(1)}`}
                >
                  {rating.toFixed(1)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {!loading && hasItems && hasMore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="w-full rounded-2xl bg-white/10 border border-white/15 px-4 py-3 text-sm font-medium hover:bg-white/15 disabled:opacity-60"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : null}

      {!loading && hasItems && !hasMore ? (
        <div className="text-center text-xs text-white/50 py-2">You’re all caught up.</div>
      ) : null}
    </div>
  );
}