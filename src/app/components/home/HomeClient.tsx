"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import FeedClient from "@/app/components/feed/FeedClient";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card className="w-[140px] sm:w-[160px] shrink-0 overflow-hidden border-white/10 bg-white/[0.03]">
      <div className="aspect-[2/3] w-full bg-white/5 animate-pulse" />
      <CardContent className="p-3 h-[78px] flex flex-col">
        <div className="h-3 w-3/4 rounded bg-white/5 animate-pulse" />
        <div className="mt-auto h-3 w-1/2 rounded bg-white/5 animate-pulse" />
      </CardContent>
    </Card>
  );
}

function CarouselRow({
  title,
  subtitle,
  items,
  loading,
  error,
  emptyMessage = "Rank more shows to unlock recommendations.",
}: {
  title: string;
  subtitle?: string;
  items: TvItem[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  function scrollByCard(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;

    // Scroll by ~3 cards (responsive)
    const cardWidth = window.innerWidth < 640 ? 140 : 160;
    const gap = 12; // gap-3
    const delta = dir * (cardWidth + gap) * 3;
    el.scrollBy({ left: delta, behavior: "smooth" });
  }

  return (
    <Card className="border-white/10 bg-white/[0.02]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base sm:text-lg">{title}</CardTitle>
            {subtitle ? <p className="text-sm text-white/60">{subtitle}</p> : null}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
              onClick={() => scrollByCard(-1)}
              aria-label={`Scroll ${title} left`}
            >
              ←
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
              onClick={() => scrollByCard(1)}
              aria-label={`Scroll ${title} right`}
            >
              →
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
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
          <div className="text-sm text-white/60">{emptyMessage}</div>
        ) : (
          <div
            ref={scrollerRef}
            className="flex gap-3 overflow-x-auto pb-2 scroll-smooth"
            role="list"
            aria-label={title}
          >
            {items.map((s) => (
              <Link
                key={s.tmdbId}
                href={`/show/${s.tmdbId}`}
                className="focus:outline-none"
              >
                <Card
                  className="group w-[140px] sm:w-[160px] shrink-0 overflow-hidden border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition"
                  role="listitem"
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

                  <CardContent className="p-3 h-[78px] flex flex-col">
                    <div className="font-medium text-sm text-white line-clamp-2 leading-snug min-h-[36px]">
                      {s.title}
                    </div>
                    <div className="mt-2 text-xs text-white/50 leading-none h-[14px]">
                      {s.year ?? ""}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      {/* Top discovery */}
      <div className="space-y-4">
        <CarouselRow
          title="Recommended for you"
          subtitle="Based on your top genres."
          items={recs}
          loading={loadingRecs}
          error={errorRecs}
          emptyMessage="Rank more shows to unlock recommendations."
        />

        <CarouselRow
          title="Trending this week"
          subtitle="What people are watching right now."
          items={trending}
          loading={loadingTrending}
          error={errorTrending}
          emptyMessage="Nothing trending right now."
        />

        <CarouselRow
          title="Popular"
          subtitle="Big mainstream shows."
          items={popular}
          loading={loadingPopular}
          error={errorPopular}
          emptyMessage="Nothing popular right now."
        />
      </div>

      {/* Feed under discovery */}
      <Card className="border-white/10 bg-white/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Friends feed</CardTitle>
          <p className="text-sm text-white/60">What your friends are ranking.</p>
        </CardHeader>
        <CardContent className="pt-0">
          <FeedClient />
        </CardContent>
      </Card>
    </div>
  );
}