

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TmdbListItem = {
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview?: string;
  // optional if your API includes it
  genreIds?: number[];
};

type Row = {
  id: string;
  title: string;
  why: string;
  tmdbId: number;
  year: string | null;
  posterPath: string | null;
  overview: string;
};

const PAGE_SIZE = 24;

function truncate(text: string, max = 120) {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + "…";
}

function posterUrl(path: string | null) {
  if (!path) return null;
  // You already use poster paths elsewhere; keep consistent with your app
  return `https://image.tmdb.org/t/p/w185${path}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Request failed: ${r.status}`);
  return (await r.json()) as T;
}

export default function RecsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trending, setTrending] = useState<TmdbListItem[]>([]);
  const [popular, setPopular] = useState<TmdbListItem[]>([]);

  const [rankedIds, setRankedIds] = useState<Set<number>>(new Set());
  const [wtwIds, setWtwIds] = useState<Set<number>>(new Set());

  const [limit, setLimit] = useState(PAGE_SIZE);

  async function loadEverything() {
    setLoading(true);
    setError(null);

    try {
      const sess = await supabase.auth.getSession();
      const user = sess.data.session?.user ?? null;
      if (!user) {
        router.push("/login");
        return;
      }

      // 1) Load ids to exclude (ranked + want_to_watch)
      const [rankedRes, wtwRes] = await Promise.all([
        supabase
          .from("ranked_shows")
          .select("tmdb_id")
          .eq("user_id", user.id),
        supabase
          .from("want_to_watch")
          .select("tmdb_id")
          .eq("user_id", user.id),
      ]);

      if (rankedRes.error) throw new Error(rankedRes.error.message);
      if (wtwRes.error) throw new Error(wtwRes.error.message);

      const rankedSet = new Set<number>();
      for (const r of rankedRes.data ?? []) {
        const n = typeof (r as any).tmdb_id === "number" ? (r as any).tmdb_id : Number((r as any).tmdb_id);
        if (Number.isFinite(n)) rankedSet.add(n);
      }

      const wtwSet = new Set<number>();
      for (const r of wtwRes.data ?? []) {
        const n = typeof (r as any).tmdb_id === "number" ? (r as any).tmdb_id : Number((r as any).tmdb_id);
        if (Number.isFinite(n)) wtwSet.add(n);
      }

      setRankedIds(rankedSet);
      setWtwIds(wtwSet);

      // 2) Load TMDB lists (conservative, cached per request)
      // These are the two route.ts files you created.
      const [tr, pop] = await Promise.all([
        fetchJson<{ results: TmdbListItem[] }>("/api/tmdb/trending-tv"),
        fetchJson<{ results: TmdbListItem[] }>("/api/tmdb/popular-tv"),
      ]);

      setTrending(Array.isArray(tr.results) ? tr.results : []);
      setPopular(Array.isArray(pop.results) ? pop.results : []);

      setLimit(PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Row[] = useMemo(() => {
    // Combine lists, de-dupe, filter out already-known shows.
    const seen = new Set<number>();

    function keep(x: TmdbListItem) {
      if (!x || typeof x.tmdbId !== "number" || !Number.isFinite(x.tmdbId)) return false;
      if (seen.has(x.tmdbId)) return false;
      if (rankedIds.has(x.tmdbId)) return false;
      if (wtwIds.has(x.tmdbId)) return false;
      seen.add(x.tmdbId);
      return true;
    }

    const out: Row[] = [];

    for (const s of trending) {
      if (!keep(s)) continue;
      out.push({
        id: `t-${s.tmdbId}`,
        why: "Trending this week",
        tmdbId: s.tmdbId,
        title: s.title,
        year: s.year ?? null,
        posterPath: s.posterPath ?? null,
        overview: truncate(s.overview ?? ""),
      });
      if (out.length >= 80) break;
    }

    for (const s of popular) {
      if (!keep(s)) continue;
      out.push({
        id: `p-${s.tmdbId}`,
        why: "Popular right now",
        tmdbId: s.tmdbId,
        title: s.title,
        year: s.year ?? null,
        posterPath: s.posterPath ?? null,
        overview: truncate(s.overview ?? ""),
      });
      if (out.length >= 120) break;
    }

    return out;
  }, [popular, rankedIds, trending, wtwIds]);

  const visible = rows.slice(0, limit);
  const canLoadMore = limit < rows.length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Recommendations</h1>
          <p className="mt-1 text-white/70">
            A light-weight v1: we pull from TMDB Trending + Popular and filter out what you already ranked / saved.
          </p>
        </div>

        <button
          onClick={loadEverything}
          className="shrink-0 rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm font-medium hover:bg-white/15"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 text-white/70">
          Loading recommendations…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 text-white/70">
          No recs yet. Try ranking a few shows first, or refresh.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            {visible.map((r) => (
              <Link
                key={r.id}
                href={`/show/${r.tmdbId}`}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.05] transition p-4 flex gap-4"
              >
                <div className="shrink-0">
                  {posterUrl(r.posterPath) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={posterUrl(r.posterPath)!}
                      alt={r.title}
                      className="h-20 w-14 rounded-lg object-cover border border-white/10"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-20 w-14 rounded-lg bg-white/5 border border-white/10" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {r.title}
                        {r.year ? <span className="text-white/60"> ({r.year})</span> : null}
                      </div>
                      <div className="mt-0.5 text-xs text-white/60">Why this: {r.why}</div>
                    </div>
                    <div className="text-xs text-white/60 group-hover:text-white/80">View →</div>
                  </div>

                  {r.overview ? (
                    <p className="mt-2 text-sm text-white/70 line-clamp-2">{r.overview}</p>
                  ) : null}
                </div>
              </Link>
            ))}
          </div>

          {canLoadMore ? (
            <button
              onClick={() => setLimit((x) => Math.min(x + PAGE_SIZE, rows.length))}
              className="w-full rounded-2xl bg-white/10 border border-white/15 px-4 py-3 font-medium hover:bg-white/15"
            >
              Load more
            </button>
          ) : null}

          <div className="text-xs text-white/50">
            Next upgrade (still Sprint 7 scope): “Because you like these genres” + “Similar to your top ranked” — we’ll add
            this by introducing a conservative Discover/Similar server route.
          </div>
        </>
      )}
    </div>
  );
}