"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getRankedShows, getState } from "@/core/logic/state";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Bookmark } from "lucide-react";

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";

function imgUrl(
  path: string | null | undefined,
  size: "w154" | "w342" | "w500" = "w342"
): string | null {
  if (!path) return null;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

function ratingBadgeClass(rating: number): string {
  // Only text + border colored (matches your list UI)
  if (rating >= 7) return "border-green-400/40 text-green-300";
  if (rating >= 4) return "border-yellow-400/40 text-yellow-300";
  return "border-red-400/40 text-red-300";
}

type DetailsPayload = {
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
  overview: string;
  genres: string[];

  // Optional extras (we’ll populate these from TMDB later)
  seasons?: number | null;
  episodes?: number | null;
  cast?: string[];
};

export default function ShowDetailsPage() {
  const router = useRouter();
  const params = useParams<{ tmdbId: string }>();

  const tmdbId = useMemo(() => Number(params?.tmdbId), [params?.tmdbId]);

  const [details, setDetails] = useState<DetailsPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingLists, setCheckingLists] = useState(false);
  const [isInWantToWatch, setIsInWantToWatch] = useState(false);
  const [isRankedInDb, setIsRankedInDb] = useState(false);
  const [listMessage, setListMessage] = useState<string | null>(null);

  const rankedMatch = useMemo(() => {
    if (!Number.isFinite(tmdbId)) return null;
    const ranked = getRankedShows(getState());
    const idx = ranked.findIndex((s) => s.tmdbId === tmdbId);
    if (idx === -1) return null;
    return { show: ranked[idx], rank: idx + 1 };
  }, [tmdbId]);

  async function requireUserId(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id ?? null;
    if (!userId) {
      router.push("/login");
      return null;
    }
    return userId;
  }

  async function refreshListStatus(nextTmdbId: number) {
    try {
      setCheckingLists(true);
      setListMessage(null);

      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      if (!userId) {
        // Not signed in -> we can't check lists
        setIsInWantToWatch(false);
        setIsRankedInDb(false);
        return;
      }

      const [rankedRes, wtwRes] = await Promise.all([
        supabase
          .from("ranked_shows")
          .select("tmdb_id", { head: true, count: "exact" })
          .eq("user_id", userId)
          .eq("tmdb_id", nextTmdbId),
        supabase
          .from("want_to_watch")
          .select("tmdb_id", { head: true, count: "exact" })
          .eq("user_id", userId)
          .eq("tmdb_id", nextTmdbId),
      ]);

      const rankedCount = rankedRes.error ? 0 : (rankedRes.count ?? 0);
      const wtwCount = wtwRes.error ? 0 : (wtwRes.count ?? 0);

      setIsRankedInDb(rankedCount > 0);
      setIsInWantToWatch(wtwCount > 0);
    } finally {
      setCheckingLists(false);
    }
  }

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
        // Also check if this show is already ranked / in want-to-watch (Supabase)
        void refreshListStatus(json.tmdbId);
      } catch {
        if (cancelled) return;
        setError("Couldn’t load details right now.");
      } finally {
        if (cancelled) return;
        setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  async function onClickRank() {
    setListMessage(null);
    const userId = await requireUserId();
    if (!userId) return;

    // Deep-link into the existing rank flow. (We are NOT changing ranking logic.)
    router.push(`/log?tmdbId=${tmdbId}&auto=1`);
  }

  async function onClickWantToWatch() {
    setListMessage(null);

    const userId = await requireUserId();
    if (!userId) return;

    if (!details || !Number.isFinite(details.tmdbId)) {
      setListMessage("Missing show details. Try again.");
      return;
    }

    // If ranked (local or backend), don’t allow adding to want-to-watch.
    if (rankedMatch || isRankedInDb) {
      setListMessage("This show is already ranked.");
      return;
    }

    try {
      setCheckingLists(true);

      // Upsert show metadata so other screens can render it reliably.
      const showRow = {
        user_id: userId,
        tmdb_id: details.tmdbId,
        title: details.title,
        poster_path: details.posterPath ?? null,
        year: details.year ?? null,
        genres: details.genres ?? [],
        overview: details.overview ?? "",
      };

      const upsertShow = await supabase
        .from("shows")
        .upsert([showRow], { onConflict: "user_id,tmdb_id" });

      if (upsertShow.error) {
        setListMessage(upsertShow.error.message);
        return;
      }

      // Add to want_to_watch (idempotent if you have a unique constraint on (user_id, tmdb_id))
      const upsertWtw = await supabase
        .from("want_to_watch")
        .upsert([{ user_id: userId, tmdb_id: details.tmdbId }], {
          onConflict: "user_id,tmdb_id",
        });

      if (upsertWtw.error) {
        // Fallback: insert (in case onConflict isn't supported by your table)
        const ins = await supabase
          .from("want_to_watch")
          .insert([{ user_id: userId, tmdb_id: details.tmdbId }]);

        if (ins.error) {
          setListMessage(ins.error.message);
          return;
        }
      }

      await refreshListStatus(details.tmdbId);
      setListMessage("Added to Want to Watch.");
    } finally {
      setCheckingLists(false);
    }
  }

  const poster = imgUrl(details?.posterPath, "w342");
  const heroImg = imgUrl(details?.posterPath, "w500");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-white/[0.03]">
        {/* Blurred backdrop */}
        {heroImg ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${heroImg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(26px)",
              transform: "scale(1.12)",
              opacity: 0.35,
            }}
          />
        ) : null}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/70 to-black/85" />

        {/* Top controls */}
        <div className="relative z-10 flex items-center justify-between gap-3 p-4 sm:p-5">
          <Button variant="secondary" onClick={() => router.back()} className="rounded-2xl">
            ← Back
          </Button>

          <div className="flex items-center gap-2">
            {!rankedMatch ? (
              <Button onClick={onClickRank} className="rounded-2xl">
                Rank
              </Button>
            ) : null}

            <Button
              type="button"
              onClick={onClickWantToWatch}
              disabled={checkingLists || isInWantToWatch || !!rankedMatch || isRankedInDb}
              variant={isInWantToWatch || rankedMatch || isRankedInDb ? "secondary" : "outline"}
              title={
                rankedMatch || isRankedInDb
                  ? "Already ranked"
                  : isInWantToWatch
                  ? "Already in Want to Watch"
                  : "Add to Want to Watch"
              }
              className={(isInWantToWatch || rankedMatch || isRankedInDb ? "opacity-60 " : "") + "rounded-2xl"}
            >
              <Bookmark className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">
                {isInWantToWatch ? "Saved" : "Want to Watch"}
              </span>
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 px-4 pb-5 sm:px-5 sm:pb-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-6 w-2/3 rounded bg-white/10" />
              <div className="h-4 w-1/2 rounded bg-white/10" />
              <div className="h-52 w-full rounded-3xl bg-white/10" />
              <div className="h-4 w-full rounded bg-white/10" />
              <div className="h-4 w-5/6 rounded bg-white/10" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : details ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-[160px,1fr] sm:gap-6">
              {/* Poster */}
              <div className="shrink-0">
                {poster ? (
                  <img
                    src={poster}
                    alt=""
                    className="w-[160px] h-[240px] rounded-3xl bg-white/10 object-cover"
                  />
                ) : (
                  <div className="w-[160px] h-[240px] rounded-3xl bg-white/10" />
                )}
              </div>

              {/* Details */}
              <div className="min-w-0 space-y-4">
                {/* Title row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-3xl sm:text-4xl font-semibold leading-tight break-words">
                      {details.title}
                    </h1>
                    <div className="mt-1 text-sm text-white/70">
                      {details.year ? details.year : ""}
                    </div>
                  </div>

                  {rankedMatch ? (
                    <div
                      className={
                        "shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full border bg-white/5 text-sm font-semibold " +
                        ratingBadgeClass(rankedMatch.show.rating)
                      }
                      aria-label={`Rating ${rankedMatch.show.rating}`}
                      title={`Rating ${rankedMatch.show.rating}`}
                    >
                      {Number(rankedMatch.show.rating).toFixed(1)}
                    </div>
                  ) : null}
                </div>

                {/* Status + quick info */}
                <div className="flex flex-wrap items-center gap-2">
                  {rankedMatch ? (
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
                      Ranked #{rankedMatch.rank}
                    </span>
                  ) : isInWantToWatch ? (
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
                      In Want to Watch
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/60">
                      Not ranked yet
                    </span>
                  )}

                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
                    Seasons: {typeof details.seasons === "number" ? details.seasons : "—"}
                  </span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
                    Episodes: {typeof details.episodes === "number" ? details.episodes : "—"}
                  </span>
                </div>

                {/* Genres */}
                {details.genres && details.genres.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {details.genres.slice(0, 8).map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/85"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Overview */}
                <p className="text-sm text-white/75 leading-relaxed">
                  {details.overview ? details.overview : "No description available."}
                </p>

                {/* Message */}
                {listMessage ? (
                  <div className="text-xs text-white/60">{listMessage}</div>
                ) : null}

                {/* Hint */}
                {!rankedMatch ? (
                  <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75">
                    Rank it now, or save it for later.
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* Details sections (below hero) */}
      {!isLoading && !error && details ? (
        <div className="space-y-4">
          {/* Cast */}
          {details.cast && details.cast.length > 0 ? (
            <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Cast</h2>
              <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
                {details.cast.slice(0, 12).map((name) => (
                  <div
                    key={name}
                    className="shrink-0 rounded-3xl border border-white/15 bg-white/5 px-4 py-3"
                  >
                    <div className="text-sm font-medium text-white/90">{name}</div>
                    <div className="mt-0.5 text-xs text-white/50">Cast</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

        </div>
      ) : null}
    </div>
  );
}