"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getRankedShows, getState } from "@/core/logic/state";
import { supabase } from "@/lib/supabaseClient";
import { addToWantToWatch, isTmdbAlreadyInWantToWatch } from "@/core/storage/wantToWatchStorage";

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

      // Local fallback (My List reads from localStorage)
      const localHasWtw = isTmdbAlreadyInWantToWatch(nextTmdbId);

      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      if (!userId) {
        // Not signed in -> show local status only.
        setIsInWantToWatch(localHasWtw);
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

      // If these fail due to RLS or auth, just treat as not present.
      const rankedCount = rankedRes.error ? 0 : (rankedRes.count ?? 0);
      const wtwCount = wtwRes.error ? 0 : (wtwRes.count ?? 0);

      setIsRankedInDb(rankedCount > 0);
      // Consider localStorage OR DB
      setIsInWantToWatch(localHasWtw || wtwCount > 0);
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

    // Add to localStorage (this is what My List uses)
    const rankedNow = getRankedShows(getState());
    const localRes = addToWantToWatch(rankedNow as any, {
      title: details?.title ?? "",
      tmdbId: details?.tmdbId ?? null,
      posterPath: details?.posterPath ?? null,
      year: details?.year ?? null,
      genres: details?.genres ?? [],
      overview: details?.overview ?? "",
      createdAt: Date.now(),
    });

    if (!localRes.ok) {
      setListMessage(localRes.error);
      return;
    }

    setIsInWantToWatch(true);

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

      // Best-effort: also persist to Supabase so it syncs across devices.
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

      // Add to want_to_watch (best-effort idempotent)
      const upsertWtw = await supabase
        .from("want_to_watch")
        .upsert([{ user_id: userId, tmdb_id: details.tmdbId }], {
          // If you have a unique constraint on (user_id, tmdb_id), this works.
          // If you don’t, Supabase will return an error; we fallback to insert.
          onConflict: "user_id,tmdb_id",
        });

      if (upsertWtw.error) {
        const ins = await supabase
          .from("want_to_watch")
          .insert([{ user_id: userId, tmdb_id: details.tmdbId }]);
        if (ins.error) {
          setListMessage(ins.error.message);
          return;
        }
      }

      setIsInWantToWatch(true);
      setListMessage("Added to Want to Watch.");
    } finally {
      setCheckingLists(false);
    }
  }

  const poster = imgUrl(details?.posterPath, "w342");
  const heroImg = imgUrl(details?.posterPath, "w500");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
        >
          ← Back
        </button>

        <div className="flex items-center gap-2">
          {rankedMatch ? (
            <>
              <span className="text-sm text-white/60">Ranked</span>
              <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm font-semibold text-white">
                #{rankedMatch.rank}
              </span>
            </>
          ) : isInWantToWatch ? (
            <span className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm font-semibold text-white">
              In Want to Watch
            </span>
          ) : (
            <span className="text-sm text-white/50">Not ranked yet</span>
          )}

          {!rankedMatch ? (
            <button
              type="button"
              onClick={onClickRank}
              className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold"
            >
              Rank
            </button>
          ) : null}

          <button
            type="button"
            onClick={onClickWantToWatch}
            disabled={checkingLists || isInWantToWatch || !!rankedMatch || isRankedInDb}
            className={
              "rounded-xl border px-3 py-2 text-sm font-semibold " +
              (isInWantToWatch || rankedMatch || isRankedInDb
                ? "bg-white/5 border-white/10 text-white/50"
                : "bg-white/10 border-white/15 text-white hover:bg-white/15")
            }
            title={
              rankedMatch || isRankedInDb
                ? "Already ranked"
                : isInWantToWatch
                ? "Already in Want to Watch"
                : "Add to Want to Watch"
            }
          >
            {isInWantToWatch ? "Added" : "Want to Watch"}
          </button>
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-white/15 bg-white/[0.03]">
        {/* Blurred backdrop */}
        {heroImg ? (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url(${heroImg})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(24px)",
              transform: "scale(1.1)",
              opacity: 0.35,
            }}
          />
        ) : null}

        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/60" />

        {/* Content */}
        <div className="relative p-5 sm:p-6">
          {isLoading ? (
            <div className="space-y-4">
              <div className="h-6 w-2/3 rounded bg-white/10" />
              <div className="h-4 w-1/2 rounded bg-white/10" />
              <div className="h-40 w-full rounded-2xl bg-white/10" />
              <div className="h-4 w-full rounded bg-white/10" />
              <div className="h-4 w-5/6 rounded bg-white/10" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : details ? (
            <div className="grid grid-cols-1 sm:grid-cols-[150px,1fr] gap-5">
              {/* Poster */}
              <div className="shrink-0">
                {poster ? (
                  <img
                    src={poster}
                    alt=""
                    className="w-[150px] h-[225px] rounded-2xl bg-white/10 object-cover"
                  />
                ) : (
                  <div className="w-[150px] h-[225px] rounded-2xl bg-white/10" />
                )}
              </div>

              {/* Right side */}
              <div className="min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h1 className="text-3xl font-semibold leading-tight break-words">
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

                {/* Genres */}
                {details.genres && details.genres.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {details.genres.slice(0, 6).map((g) => (
                      <span
                        key={g}
                        className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/85"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                ) : null}

                {/* Overview preview */}
                <p className="text-sm text-white/75 leading-relaxed">
                  {details.overview
                    ? details.overview
                    : "No description available."}
                </p>

                {/* Mini stats row */}
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70">
                    Seasons: {typeof details.seasons === "number" ? details.seasons : "—"}
                  </span>
                  <span className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/70">
                    Episodes: {typeof details.episodes === "number" ? details.episodes : "—"}
                  </span>
                </div>

                {!rankedMatch ? (
                  <div className="space-y-2">
                    <div className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75">
                      Rank it now, or save it for later.
                    </div>

                    {listMessage ? (
                      <div className="text-xs text-white/60">{listMessage}</div>
                    ) : null}
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
                    className="shrink-0 rounded-2xl border border-white/15 bg-white/5 px-4 py-3"
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