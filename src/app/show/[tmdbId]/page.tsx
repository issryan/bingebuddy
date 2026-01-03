"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getRankedShows, getState } from "@/core/logic/state";

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";

function posterUrl(
  path: string | null | undefined,
  size: "w342" | "w500" = "w500"
): string | null {
  if (!path) return null;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

function ratingBadgeClass(rating: number): string {
  // Match the rest of the app: only text + border colored.
  if (rating >= 7) return "border-green-600/40 text-green-700";
  if (rating >= 4) return "border-yellow-600/40 text-yellow-700";
  return "border-red-600/40 text-red-700";
}

type DetailsPayload = {
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
  genres: string[];
};

export default function ShowDetailsPage() {
  const router = useRouter();
  const params = useParams<{ tmdbId: string }>();

  const tmdbId = useMemo(() => Number(params?.tmdbId), [params?.tmdbId]);

  const [details, setDetails] = useState<DetailsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Find this show in the user's ranked list (if present)
  const rankedMatch = useMemo(() => {
    if (!Number.isFinite(tmdbId)) return null;
    const ranked = getRankedShows(getState());
    const idx = ranked.findIndex((s) => s.tmdbId === tmdbId);
    if (idx === -1) return null;
    return { show: ranked[idx], rank: idx + 1 };
  }, [tmdbId]);

  useEffect(() => {
    if (!Number.isFinite(tmdbId)) {
      setError("Invalid show id.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);

        const res = await fetch(`/api/tmdb/details?id=${tmdbId}`);
        if (!res.ok) throw new Error("Failed to load show details");
        const json = (await res.json()) as DetailsPayload;

        if (cancelled) return;
        setDetails(json);
      } catch {
        if (cancelled) return;
        setError("Couldn’t load details right now.");
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  const img = posterUrl(details?.posterPath, "w500");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
        >
          ← Back
        </button>

        {rankedMatch ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-white/60">Ranked</span>
            <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm font-semibold text-white">
              #{rankedMatch.rank}
            </span>
          </div>
        ) : (
          <span className="text-sm text-white/50">Not ranked yet</span>
        )}
      </div>

      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-6 w-2/3 rounded bg-white/10" />
            <div className="h-4 w-1/2 rounded bg-white/10" />
            <div className="h-64 w-full rounded-xl bg-white/10" />
            <div className="h-4 w-full rounded bg-white/10" />
            <div className="h-4 w-5/6 rounded bg-white/10" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        ) : details ? (
          <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6">
            {/* Poster */}
            <div className="w-full">
              {img ? (
                <img
                  src={img}
                  alt=""
                  className="w-full max-w-[260px] md:max-w-none rounded-2xl bg-white/10 object-cover"
                />
              ) : (
                <div className="w-full max-w-[260px] md:max-w-none aspect-[2/3] rounded-2xl bg-white/10" />
              )}
            </div>

            {/* Content */}
            <div className="min-w-0 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold leading-tight break-words">
                    {details.title}
                  </h1>
                  <p className="mt-1 text-white/60">
                    {details.year ? details.year : ""}
                  </p>
                </div>

                {rankedMatch ? (
                  <div
                    className={
                      "shrink-0 inline-flex items-center justify-center w-14 h-14 rounded-full border bg-white/5 text-lg font-semibold " +
                      ratingBadgeClass(rankedMatch.show.rating)
                    }
                    aria-label={`Rating ${rankedMatch.show.rating}`}
                    title={`Rating ${rankedMatch.show.rating}`}
                  >
                    {Number(rankedMatch.show.rating).toFixed(1)}
                  </div>
                ) : null}
              </div>

              {/* Genres */}
              {details.genres && details.genres.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {details.genres.slice(0, 6).map((g) => (
                    <span
                      key={g}
                      className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Overview */}
              <div className="space-y-2">
                <h2 className="text-sm font-semibold text-white/80">
                  Description
                </h2>
                <p className="text-sm text-white/70 leading-relaxed">
                  {details.overview
                    ? details.overview
                    : "No description available."}
                </p>
              </div>

              {!rankedMatch ? (
                <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/70">
                  Not ranked yet. Go to Log to rank this show.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}