"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import FeedClient from "@/app/components/feed/FeedClient";
import { supabase } from "@/lib/supabaseClient";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

function CardSkeleton({ size }: { size: "sm" | "lg" }) {
  const cardW = size === "lg" ? "w-[176px] sm:w-[204px]" : "w-[148px] sm:w-[168px]";
  const contentH = size === "lg" ? "h-[84px]" : "h-[76px]";

  return (
    <Card className={`${cardW} shrink-0 overflow-hidden border-white/10 bg-white/[0.03]`}>
      <div className="aspect-[2/3] w-full bg-white/5 animate-pulse" />
      <CardContent className={`p-3 ${contentH} flex flex-col`}>
        <div className="h-3 w-4/5 rounded bg-white/5 animate-pulse" />
        <div className="mt-2 h-3 w-3/5 rounded bg-white/5 animate-pulse" />
        <div className="mt-auto h-3 w-1/3 rounded bg-white/5 animate-pulse" />
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
  tone = "default",
  size = "sm",
}: {
  title: string;
  subtitle?: string;
  items: TvItem[];
  loading: boolean;
  error: string | null;
  emptyMessage?: string;
  tone?: "default" | "primary";
  size?: "sm" | "lg";
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const cardW = size === "lg" ? "w-[176px] sm:w-[204px]" : "w-[148px] sm:w-[168px]";
  const metaH = size === "lg" ? "h-[84px]" : "h-[76px]";

  function scrollByCards(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;

    // Scroll ~3 cards at a time.
    const base = size === "lg" ? (window.innerWidth < 640 ? 176 : 204) : window.innerWidth < 640 ? 148 : 168;
    const gap = 14; // ~gap-3.5
    el.scrollBy({ left: dir * (base + gap) * 3, behavior: "smooth" });
  }

  const headerTone =
    tone === "primary"
      ? "rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015]"
      : "";

  return (
    <section className={tone === "primary" ? `${headerTone} p-4 sm:p-5` : ""}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base sm:text-lg font-semibold text-white truncate">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-white/60 line-clamp-2">{subtitle}</div> : null}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 px-0"
            onClick={() => scrollByCards(-1)}
            aria-label={`Scroll ${title} left`}
          >
            ←
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 px-0"
            onClick={() => scrollByCards(1)}
            aria-label={`Scroll ${title} right`}
          >
            →
          </Button>
        </div>
      </div>

      <div className={tone === "primary" ? "mt-4" : "mt-3"}>
        {loading ? (
          <div className="flex gap-3.5 overflow-x-auto pb-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <CardSkeleton key={i} size={size} />
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
            className="flex gap-3.5 overflow-x-auto pb-2 scroll-smooth"
            role="list"
            aria-label={title}
          >
            {items.map((s) => (
              <Link key={s.tmdbId} href={`/show/${s.tmdbId}`} className="focus:outline-none">
                <Card
                  className={
                    `group ${cardW} shrink-0 overflow-hidden border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0`
                  }
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
                      <div className="h-full w-full flex items-center justify-center text-xs text-white/40">No poster</div>
                    )}
                  </div>

                  {/* Uniform meta area. Title is clamped but never visually cut mid-line. */}
                  <CardContent className={`p-3 ${metaH} flex flex-col`}>
                    <div className="text-sm font-medium text-white leading-snug line-clamp-2">
                      {s.title}
                    </div>
                    <div className="mt-auto text-xs text-white/50 leading-none">{s.year ?? ""}</div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
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
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {/* Compact header strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="text-sm text-white/70">Welcome back</div>
          <div className="text-xl sm:text-2xl font-semibold text-white">Discover something new today.</div>
        </div>

        <div className="flex gap-2">
          <Button asChild className="rounded-xl">
            <Link href="/rank">Log a show</Link>
          </Button>
          <Button
            asChild
            variant="secondary"
            className="rounded-xl bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
          >
            <Link href="/my-list">My List</Link>
          </Button>
        </div>
      </div>

      {/* For You (primary) */}
      <CarouselRow
        title="For you"
        subtitle="Recommendations based on your top genres."
        items={recs}
        loading={loadingRecs}
        error={errorRecs}
        emptyMessage="Rank more shows to unlock recommendations."
        tone="primary"
        size="lg"
      />

      {/* Discovery (lighter weight, no heavy containers) */}
      <div className="space-y-8">
        <div className="space-y-3">
          <CarouselRow
            title="Trending"
            subtitle="This week on TV."
            items={trending}
            loading={loadingTrending}
            error={errorTrending}
            emptyMessage="Nothing trending right now."
            size="sm"
          />
        </div>

        <div className="space-y-3">
          <CarouselRow
            title="Popular"
            subtitle="What most people are watching."
            items={popular}
            loading={loadingPopular}
            error={errorPopular}
            emptyMessage="Nothing popular right now."
            size="sm"
          />
        </div>
      </div>

      {/* Friends activity (lightweight, breathable) */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-semibold text-white">Friends activity</div>
            <div className="mt-1 text-sm text-white/60">What your friends are ranking.</div>
          </div>

          <Button
            asChild
            variant="secondary"
            className="h-9 px-3 rounded-xl bg-white/5 border border-white/10 text-white/80 hover:bg-white/10 shrink-0"
          >
            <Link href="/friends">Friends</Link>
          </Button>
        </div>

        <div className="h-px w-full bg-white/10" />

        {/* Cap height so Home doesn't become an infinite scroll */}
        <div className="max-h-[520px] overflow-auto pr-1">
          <FeedClient />
        </div>
      </section>
    </div>
  );
}