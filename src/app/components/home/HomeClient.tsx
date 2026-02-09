"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import FeedClient from "@/app/components/feed/FeedClient";
import { supabase } from "@/lib/supabaseClient";

type TvItem = {
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
};

function posterUrl(path: string) {
  return `https://image.tmdb.org/t/p/w342${path}`;
}

function normalizeGenre(g: unknown): string | null {
  if (typeof g !== "string") return null;
  const s = g.trim();
  if (!s) return null;
  return s;
}

function topGenresFromGenreArrays(genreArrays: unknown[], maxGenres: number): string[] {
  const counts = new Map<string, number>();

  for (const arr of genreArrays) {
    if (!Array.isArray(arr)) continue;
    for (const raw of arr) {
      const g = normalizeGenre(raw);
      if (!g) continue;
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxGenres)
    .map(([g]) => g);
}

function CardSkeleton() {
  return (
    <div className="w-[140px] sm:w-[160px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden">
      <div className="aspect-[2/3] w-full bg-white/5 animate-pulse" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-3/4 bg-white/5 animate-pulse rounded" />
        <div className="h-3 w-1/2 bg-white/5 animate-pulse rounded" />
      </div>
    </div>
  );
}

function CarouselRow({
  title,
  subtitle,
  items,
  loading,
  error,
}: {
  title: string;
  subtitle?: string;
  items: TvItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-white/60">{subtitle}</p> : null}
      </div>

      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-white/60">Rank more shows to unlock recommendations.</div>
      ) : (
        <div
          className="flex gap-3 overflow-x-auto pb-2"
        >
          {items.map((s) => (
            <Link
              key={s.tmdbId}
              href={`/show/${s.tmdbId}`}
              className="group w-[140px] sm:w-[160px] shrink-0 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition overflow-hidden"
            >
              <div className="aspect-[2/3] w-full bg-white/5">
                {s.posterPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterUrl(s.posterPath)}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-white/40">
                    No poster
                  </div>
                )}
              </div>

              <div className="p-3">
                <div className="font-medium text-sm text-white line-clamp-2">
                  {s.title}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  {s.year ? s.year : " "}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomeClient() {
  const [trending, setTrending] = useState<TvItem[]>([]);
  const [popular, setPopular] = useState<TvItem[]>([]);

  const [recommended, setRecommended] = useState<TvItem[]>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(true);
  const [errorRecommended, setErrorRecommended] = useState<string | null>(null);

  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);

  const [errorTrending, setErrorTrending] = useState<string | null>(null);
  const [errorPopular, setErrorPopular] = useState<string | null>(null);

  const recs = recommended;
  const loadingRecs = loadingRecommended;
  const errorRecs = errorRecommended;

  useEffect(() => {
    let alive = true;

    async function loadTrending() {
      try {
        setLoadingTrending(true);
        setErrorTrending(null);
        const res = await fetch("/api/tmdb/trending-tv", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load trending shows.");
        const json = await res.json();
        const items = Array.isArray(json.results) ? (json.results as TvItem[]) : [];
        if (!alive) return;
        setTrending(items);
      } catch (e) {
        if (!alive) return;
        setErrorTrending(e instanceof Error ? e.message : "Failed to load trending shows.");
      } finally {
        if (!alive) return;
        setLoadingTrending(false);
      }
    }

    async function loadPopular() {
      try {
        setLoadingPopular(true);
        setErrorPopular(null);
        const res = await fetch("/api/tmdb/popular-tv", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load popular shows.");
        const json = await res.json();
        const items = Array.isArray(json.results) ? (json.results as TvItem[]) : [];
        if (!alive) return;
        setPopular(items);
      } catch (e) {
        if (!alive) return;
        setErrorPopular(e instanceof Error ? e.message : "Failed to load popular shows.");
      } finally {
        if (!alive) return;
        setLoadingPopular(false);
      }
    }

    async function loadRecommended() {
      try {
        setLoadingRecommended(true);
        setErrorRecommended(null);

        const { data: sess } = await supabase.auth.getSession();
        const userId = sess.session?.user?.id;

        // Not signed in yet -> just use fallback
        if (!userId) {
          if (!alive) return;
          setRecommended([]);
          return;
        }

        // Get top ranked tmdb_ids (first ~30 is plenty for genre signal)
        const rankedRes = await supabase
          .from("ranked_shows")
          .select("tmdb_id, rank_position")
          .eq("user_id", userId)
          .order("rank_position", { ascending: true })
          .limit(30);

        if (rankedRes.error) {
          throw new Error(rankedRes.error.message);
        }

        const rankedTmdbIds = (rankedRes.data ?? [])
          .map((r: any) => (typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id)))
          .filter((n: number) => Number.isFinite(n));

        if (rankedTmdbIds.length === 0) {
          if (!alive) return;
          setRecommended([]);
          return;
        }

        // Also exclude Want-to-Watch so recommendations don’t repeat things you’ve already saved.
        const wtwRes = await supabase
          .from("want_to_watch")
          .select("tmdb_id")
          .eq("user_id", userId);

        if (wtwRes.error) {
          throw new Error(wtwRes.error.message);
        }

        const wtwTmdbIds = (wtwRes.data ?? [])
          .map((r: any) => (typeof r.tmdb_id === "number" ? r.tmdb_id : Number(r.tmdb_id)))
          .filter((n: number) => Number.isFinite(n));

        const excludeIds = Array.from(new Set<number>([...rankedTmdbIds, ...wtwTmdbIds]));

        // Pull genres for those shows from your per-user `shows` table
        const showsRes = await supabase
          .from("shows")
          .select("tmdb_id, genres")
          .eq("user_id", userId)
          .in("tmdb_id", rankedTmdbIds);

        if (showsRes.error) {
          throw new Error(showsRes.error.message);
        }

        const genreArrays = (showsRes.data ?? []).map((r: any) => r.genres);
        const topGenres = topGenresFromGenreArrays(genreArrays, 3);

        // If we can't infer genres, use fallback
        if (topGenres.length === 0) {
          if (!alive) return;
          setRecommended([]);
          return;
        }

        const url = `/api/tmdb/recommended-tv?genres=${encodeURIComponent(
          topGenres.join(",")
        )}&limit=12&exclude=${encodeURIComponent(excludeIds.join(","))}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load recommendations.");

        const json = await res.json();
        const items = Array.isArray(json.results) ? (json.results as TvItem[]) : [];
        const excludeSet = new Set<number>(excludeIds);
        const filtered = items.filter((it) => !excludeSet.has(it.tmdbId));
        if (!alive) return;
        setRecommended(filtered);
      } catch (e) {
        if (!alive) return;
        setErrorRecommended(e instanceof Error ? e.message : "Failed to load recommendations.");
        setRecommended([]);
      } finally {
        if (!alive) return;
        setLoadingRecommended(false);
      }
    }

    void loadTrending();
    void loadPopular();
    void loadRecommended();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Top discovery carousels */}
      <div className="space-y-6">
        <CarouselRow
          title="Recommended for you"
          subtitle="Based on your top genres."
          items={recs}
          loading={loadingRecs}
          error={errorRecs}
        />

        <CarouselRow
          title="Trending this week"
          subtitle="What people are watching right now."
          items={trending}
          loading={loadingTrending}
          error={errorTrending}
        />

        <CarouselRow
          title="Popular"
          subtitle="Big mainstream shows."
          items={popular}
          loading={loadingPopular}
          error={errorPopular}
        />
      </div>

      {/* Feed under discovery */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">Friends feed</h2>
          <p className="text-sm text-white/60">What your friends are ranking.</p>
        </div>

        <FeedClient />
      </section>
    </div>
  );
}