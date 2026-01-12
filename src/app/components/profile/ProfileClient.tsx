"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [rankedCount, setRankedCount] = useState(0);
  const [wantToWatchCount, setWantToWatchCount] = useState(0);
  const [avgRating, setAvgRating] = useState<number | null>(null);

  const [topShow, setTopShow] = useState<{ title: string; rating: number } | null>(null);
  const [bottomShow, setBottomShow] = useState<{ title: string; rating: number } | null>(null);
  const [newestShow, setNewestShow] = useState<{ title: string; dateLabel: string } | null>(null);
  const [daysSinceFirst, setDaysSinceFirst] = useState<number | null>(null);
  const [topGenres, setTopGenres] = useState<Array<{ genre: string; count: number }>>([]);

  function recomputeStatsFromLocal() {
    const ranked = getRankedShows(getState());
    setRankedCount(ranked.length);

    const wtw = safeGetWantToWatch();
    setWantToWatchCount(wtw.length);

    if (ranked.length === 0) {
      setAvgRating(null);
      setTopShow(null);
      setBottomShow(null);
      setNewestShow(null);
      setDaysSinceFirst(null);
      setTopGenres([]);
      return;
    }

    const sum = ranked.reduce((acc, s) => acc + s.rating, 0);
    const avg = sum / ranked.length;
    setAvgRating(Math.round(avg * 10) / 10);

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
      const sessionRes = await supabase.auth.getSession();
      const user = sessionRes.data.session?.user ?? null;

      if (!user) {
        recomputeStatsFromLocal();
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
          setState(cloud.state);
          safeSetWantToWatch(normalizeWantToWatch(cloud.wantToWatch));
        }
      }

      recomputeStatsFromLocal();
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

  const avgText = useMemo(() => {
    if (avgRating === null) return "—";
    return avgRating.toFixed(1);
  }, [avgRating]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Ranked shows</div>
          <div className="mt-1 text-3xl font-semibold">{rankedCount}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Want to watch</div>
          <div className="mt-1 text-3xl font-semibold">{wantToWatchCount}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Average rating</div>
          <div className="mt-1 text-3xl font-semibold">{avgText}</div>
          <div className="mt-2 text-xs text-white/50">Derived from your ranked order</div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Top show</div>
          <div className="mt-1 text-lg font-semibold truncate">
            {topShow ? topShow.title : "—"}
          </div>
          <div className="mt-1 text-sm text-white/60">{topShow ? `Rating ${topShow.rating}` : ""}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Lowest show</div>
          <div className="mt-1 text-lg font-semibold truncate">
            {bottomShow ? bottomShow.title : "—"}
          </div>
          <div className="mt-1 text-sm text-white/60">
            {bottomShow ? `Rating ${bottomShow.rating}` : ""}
          </div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Newest ranked</div>
          <div className="mt-1 text-lg font-semibold truncate">
            {newestShow ? newestShow.title : "—"}
          </div>
          <div className="mt-1 text-sm text-white/60">{newestShow ? newestShow.dateLabel : ""}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Days since first log</div>
          <div className="mt-1 text-3xl font-semibold">{daysSinceFirst === null ? "—" : daysSinceFirst}</div>
        </div>

        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <div className="text-white/70 text-sm">Top genres</div>
          {topGenres.length === 0 ? (
            <div className="mt-2 text-sm text-white/50">—</div>
          ) : (
            <ol className="mt-2 space-y-1">
              {topGenres.slice(0, 3).map((g) => (
                <li key={g.genre} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-white/80 truncate">{g.genre}</span>
                  <span className="text-xs text-white/50 shrink-0">{g.count}</span>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-2 text-xs text-white/40">Based on ranked shows</div>
        </div>
      </div>
    </div>
  );
}