"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import FeedClient from "@/app/components/feed/FeedClient";

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
        <div className="text-sm text-white/60">Nothing to show yet.</div>
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

  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingPopular, setLoadingPopular] = useState(true);

  const [errorTrending, setErrorTrending] = useState<string | null>(null);
  const [errorPopular, setErrorPopular] = useState<string | null>(null);

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

    void loadTrending();
    void loadPopular();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="space-y-8">
      {/* Top discovery carousels */}
      <div className="space-y-6">
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