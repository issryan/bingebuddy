"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Preference } from "@/core/logic/ranking";
import {
  addFirstShow,
  applyComparisonAnswer,
  getRankedShows,
  getState,
  startComparisonSession,
  type CompareSession,
} from "@/core/logic/state";
import Link from "next/link";
import {
  addToWantToWatch,
  removeFromWantToWatchByTitle,
  removeFromWantToWatchByTmdbId,
} from "@/core/storage/wantToWatchStorage";
import { safeGetWantToWatch } from "@/core/storage/wantToWatchStorage";
import { saveToBackend } from "@/core/storage/backendSync";
import { supabase } from "@/lib/supabaseClient";


const MAX_SKIPS_BEFORE_AUTOPLACE = 5;

function notifyStateChanged() {
  // Used by the Supabase sync layer (and any other listeners) to persist changes.
  // This keeps LogExperience decoupled from backend details.
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("bingebuddy:state-changed"));
}

async function saveSnapshotToCloud(): Promise<void> {
  try {
    const sessionRes = await supabase.auth.getSession();
    const user = sessionRes.data.session?.user ?? null;
    if (!user) return; // not signed in -> local only

    const state = getState();
    const wtw = safeGetWantToWatch();

    // Fire-and-forget write-through. Errors are intentionally ignored here
    // because the UI already works offline/local-first.
    await saveToBackend(user.id, state, wtw as any);
  } catch {
    // ignore
  }
}

type UndoEntry = {
  session: CompareSession;
  skipped: number[]; // skipped compareIndex values within this session
};

export default function LogExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [title, setTitle] = useState("");
  type TmdbSearchItem = {
    tmdbId: number;
    title: string;
    year: string | null;
    posterPath: string | null;
    overview: string;
  };

  const [searchResults, setSearchResults] = useState<TmdbSearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTmdbId, setSelectedTmdbId] = useState<number | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<{
    tmdbId: number;
    posterPath: string | null;
    year: string | null;
    overview: string;
    genres: string[];
  } | null>(null);
  const [session, setSession] = useState<CompareSession | null>(null);

  // Undo is only within the current session (in-memory)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [skippedCompareIndexes, setSkippedCompareIndexes] = useState<number[]>([]);

  const [ranked, setRanked] = useState(() => getRankedShows(getState()));

  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refreshRanked() {
    setRanked(getRankedShows(getState()));
  }

  useEffect(() => {
    refreshRanked();
  }, []);

  // Debounced TMDB search effect
  useEffect(() => {
    if (!title || title.trim().length < 2 || session) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        setIsSearching(true);
        const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(title.trim())}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json();
        setSearchResults(json.results ?? []);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [title, session]);

  async function handleSelectResult(item: TmdbSearchItem) {
    try {
      const res = await fetch(`/api/tmdb/details?id=${item.tmdbId}`);
      if (!res.ok) throw new Error("Failed to load details");
      const details = await res.json();

      setSelectedMeta({
        tmdbId: details.tmdbId,
        posterPath: details.posterPath ?? null,
        year: details.year ?? null,
        overview: details.overview ?? "",
        genres: details.genres ?? [],
      });

      setTitle(details.title);
      setSelectedTmdbId(details.tmdbId);
      setSearchResults([]);
      setError(null);
    } catch {
      // fallback to title-only
      setTitle(item.title);
      setSelectedTmdbId(item.tmdbId);
      setSearchResults([]);
      setError(null);
    }
  }

  const comparisonShow = useMemo(() => {
    if (!session) return null;
    const state = getState();
    return state.shows[session.compareIndex] ?? null;
  }, [session]);

  function goToSavedScreen(savedTitle: string) {
    const nextRanked = getRankedShows(getState());
    setRanked(nextRanked);

    const index = nextRanked.findIndex(
      (s) => s.title.trim().toLowerCase() === savedTitle.trim().toLowerCase()
    );

    const params = new URLSearchParams();
    params.set("title", savedTitle);

    if (index !== -1) {
      params.set("rank", String(index + 1));
      params.set("rating", String(nextRanked[index].rating));
    }

    // Once ranked, remove from Want to Watch (prefer tmdbId when available)
    const match = nextRanked.find(
      (s) => s.title.trim().toLowerCase() === savedTitle.trim().toLowerCase()
    );

    if (match && typeof match.tmdbId === "number") {
      removeFromWantToWatchByTmdbId(match.tmdbId);
    } else {
      removeFromWantToWatchByTitle(savedTitle);
    }

    // Clear metadata after save
    setSelectedMeta(null);
    setSelectedTmdbId(null);

    // Tell the sync layer we changed local data (ranked list + want-to-watch removal)
    notifyStateChanged();
    // Write-through so cloud is updated BEFORE any screen (like Profile) reloads from backend
    void saveSnapshotToCloud();
    router.push(`/saved?${params.toString()}`);
  }

  function handleAddToWantToWatch() {
    const clean = title.trim();

    const result = addToWantToWatch(ranked as any, {
      title: clean,
      tmdbId: selectedMeta?.tmdbId ?? (typeof selectedTmdbId === "number" ? selectedTmdbId : null),
      posterPath: selectedMeta?.posterPath ?? null,
      year: selectedMeta?.year ?? null,
      genres: selectedMeta?.genres ?? [],
      overview: selectedMeta?.overview ?? "",
      createdAt: Date.now(),
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    // Tell the sync layer we changed local data (want-to-watch)
    notifyStateChanged();
    void saveSnapshotToCloud();

    // Clear metadata when adding to Want To Watch
    setSelectedMeta(null);
    setSelectedTmdbId(null);

    setTitle("");
    setSession(null);
    setUndoStack([]);
    setSkippedCompareIndexes([]);
    setError(null);

    router.push("/my-list");
  }

  type MetaOpts = {
    tmdbId?: number | null;
    posterPath?: string | null;
    year?: string | null;
    overview?: string;
    genres?: string[];
  };

  async function ensureMetaForStart(): Promise<MetaOpts | undefined> {
    // If we already have meta for the current selection, use it.
    if (selectedMeta && selectedTmdbId && selectedMeta.tmdbId === selectedTmdbId) {
      return selectedMeta;
    }

    // If the user didn't click a search result, try to auto-pick the first TMDB match.
    // This prevents ranking shows with missing tmdbId/metadata.
    let tmdbIdToUse = selectedTmdbId;

    if (!tmdbIdToUse) {
      const q = title.trim();
      if (q.length < 2) return undefined;

      try {
        setIsWorking(true);
        const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(q)}`);
        if (!res.ok) return undefined;

        const json = await res.json();
        const first = Array.isArray(json?.results) ? json.results[0] : null;
        const firstId = first && typeof first.tmdbId === "number" ? first.tmdbId : null;
        if (!firstId) return undefined;

        tmdbIdToUse = firstId;
        setSelectedTmdbId(firstId);
      } catch {
        return undefined;
      } finally {
        setIsWorking(false);
      }
    }

    try {
      setIsWorking(true);

      const res = await fetch(`/api/tmdb/details?id=${tmdbIdToUse}`);
      if (!res.ok) return undefined;

      const details = await res.json();

      const meta: MetaOpts = {
        tmdbId: details.tmdbId,
        posterPath: details.posterPath ?? null,
        year: details.year ?? null,
        overview: details.overview ?? "",
        genres: details.genres ?? [],
      };

      setSelectedMeta({
        tmdbId: details.tmdbId,
        posterPath: details.posterPath ?? null,
        year: details.year ?? null,
        overview: details.overview ?? "",
        genres: details.genres ?? [],
      });

      // Canonical title from TMDB
      if (typeof details.title === "string" && details.title.trim()) {
        setTitle(details.title);
      }

      return meta;
    } catch {
      return undefined;
    } finally {
      setIsWorking(false);
    }
  }

  async function startWithTitle(clean: string) {
    if (!clean) {
      setError("Enter a show title to continue.");
      return;
    }

    // Prevent ranking duplicates
    const alreadyRanked = ranked.some(
      (s) => s.title.trim().toLowerCase() === clean.toLowerCase()
    );

    if (alreadyRanked) {
      setError("That show is already ranked.");
      return;
    }

    const metaOpts = await ensureMetaForStart();

    if (!metaOpts || typeof metaOpts.tmdbId !== "number") {
      setError("Pick a show from the search results so we can attach the right metadata.");
      return;
    }

    if (ranked.length === 0) {
      addFirstShow(clean, metaOpts);
      // Tell the sync layer we changed local data (ranked list)
      notifyStateChanged();
      void saveSnapshotToCloud();
      setTitle("");
      setSession(null);
      setUndoStack([]);
      setSkippedCompareIndexes([]);
      goToSavedScreen(clean);
      return;
    }

    const s = startComparisonSession(clean, metaOpts);
    if (!s) return;

    setSession(s);
    setUndoStack([]);
    setSkippedCompareIndexes([]);
  }

  async function handleStart() {
    await startWithTitle(title.trim());
  }

  function handleAnswer(preference: Preference) {
    if (!session) return;

    // Save for undo (including skipped memory)
    setUndoStack((prev) => [...prev, { session, skipped: skippedCompareIndexes }]);

    setIsWorking(true);
    const next = applyComparisonAnswer(session, preference);

    if (next === null) {
      const savedTitle = title.trim();
      setSession(null);
      setUndoStack([]);
      setSkippedCompareIndexes([]);
      setTitle("");
      goToSavedScreen(savedTitle);
      setIsWorking(false);
    } else {
      setSession(next);
      setIsWorking(false);
    }
  }

  function handleUndo() {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setSession(last.session);
      setSkippedCompareIndexes(last.skipped);
      return prev.slice(0, -1);
    });
  }

  function handleSkip() {
    if (!session) return;

    // Save for undo
    setUndoStack((prev) => [...prev, { session, skipped: skippedCompareIndexes }]);

    setIsWorking(true);

    const { low, high, compareIndex } = session;
    const windowSize = high - low;

    // Mark this index as skipped (once)
    const nextSkipped = skippedCompareIndexes.includes(compareIndex)
      ? skippedCompareIndexes
      : [...skippedCompareIndexes, compareIndex];

    // If the user keeps skipping, auto-place at the END after a few skips to avoid long sessions.
    if (nextSkipped.length >= MAX_SKIPS_BEFORE_AUTOPLACE) {
      const savedTitle = title.trim();
      const insertAt = high;

      const forced: CompareSession = {
        ...session,
        low: insertAt,
        high: insertAt,
        compareIndex: insertAt,
      };

      const done = applyComparisonAnswer(forced, "new");

      if (done === null) {
        setSession(null);
        setUndoStack([]);
        setSkippedCompareIndexes([]);
        setTitle("");
        goToSavedScreen(savedTitle);
        setIsWorking(false);
        return;
      } else {
        setSkippedCompareIndexes(nextSkipped);
        setSession(done);
        setIsWorking(false);
        return;
      }
    }

    // Try to find a NEW compareIndex within [low, high) not yet skipped
    if (windowSize > 1) {
      let nextIndex: number | null = null;

      // Prefer nearby indices for less “jarring” jumps
      for (let offset = 1; offset < windowSize; offset++) {
        const right = compareIndex + offset;
        const left = compareIndex - offset;

        if (right < high && !nextSkipped.includes(right)) {
          nextIndex = right;
          break;
        }
        if (left >= low && !nextSkipped.includes(left)) {
          nextIndex = left;
          break;
        }
      }

      // If we found a new one, switch targets and continue
      if (nextIndex !== null) {
        setSkippedCompareIndexes(nextSkipped);
        setSession({ ...session, compareIndex: nextIndex });
        setIsWorking(false);
        return;
      }
    }

    // If we couldn’t find anything new, auto-place at the END so the user can move on.
    const savedTitle = title.trim();

    // Force insertion at index `high` (end of current search window; in a fresh session this is end of list)
    const insertAt = high;

    const forced: CompareSession = {
      ...session,
      low: insertAt,
      high: insertAt,
      compareIndex: insertAt,
    };

    const done = applyComparisonAnswer(forced, "new");

    if (done === null) {
      setSession(null);
      setUndoStack([]);
      setSkippedCompareIndexes([]);
      setTitle("");
      goToSavedScreen(savedTitle);
      setIsWorking(false);
    } else {
      // Should be rare, but keep safe
      setSkippedCompareIndexes(nextSkipped);
      setSession(done);
      setIsWorking(false);
    }
  }

  // Prefill + auto-start from:
  // - /log?title=...&auto=1
  // - /log?tmdbId=...&auto=1
  useEffect(() => {
    const prefillTitle = searchParams.get("title");
    const prefillTmdbIdRaw = searchParams.get("tmdbId");
    const auto = searchParams.get("auto") === "1";

    // Only run when we're idle.
    // If `auto=1` is set (e.g., coming from Want to Watch → Rank), allow override even if input already has text.
    if (session !== null) return;
    if (!auto && title.trim() !== "") return;

    async function run() {
      // If tmdbId exists, fetch details and prefill everything
      if (prefillTmdbIdRaw) {
        const id = Number(prefillTmdbIdRaw);
        if (Number.isFinite(id)) {
          try {
            const res = await fetch(`/api/tmdb/details?id=${id}`);
            if (res.ok) {
              const details = await res.json();
              setSelectedTmdbId(details.tmdbId);
              setSelectedMeta({
                tmdbId: details.tmdbId,
                posterPath: details.posterPath ?? null,
                year: details.year ?? null,
                overview: details.overview ?? "",
                genres: details.genres ?? [],
              });
              setTitle(details.title);

              if (auto) {
                const clean = String(details.title).trim();

                // Prevent ranking duplicates
                const alreadyRanked = ranked.some(
                  (s) => s.title.trim().toLowerCase() === clean.toLowerCase()
                );

                if (alreadyRanked) {
                  setError("That show is already ranked.");
                  return;
                }

                const metaOpts: MetaOpts = {
                  tmdbId: details.tmdbId,
                  posterPath: details.posterPath ?? null,
                  year: details.year ?? null,
                  overview: details.overview ?? "",
                  genres: details.genres ?? [],
                };

                // Start ranking immediately using the fetched metadata (no async state dependency)
                if (ranked.length === 0) {
                  addFirstShow(clean, metaOpts);
                  setTitle("");
                  setSession(null);
                  setUndoStack([]);
                  setSkippedCompareIndexes([]);
                  goToSavedScreen(clean);
                } else {
                  const s = startComparisonSession(clean, metaOpts);
                  if (s) {
                    setSession(s);
                    setUndoStack([]);
                    setSkippedCompareIndexes([]);
                    setError(null);
                  }
                }

                return;
              }
              return;
            }
          } catch {
            // fall through
          }
        }
      }

      // Fallback: title-only prefill
      if (prefillTitle) {
        setTitle(prefillTitle);
        if (auto) {
          void startWithTitle(prefillTitle.trim());
        }
      }
    }

    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session, ranked.length]);

  const hasShows = ranked.length > 0;
  const isComparing = session !== null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Log</h2>
          <p className="text-sm text-white/60">
            Add a show you’ve watched, or save one for later.
          </p>
        </div>
        <label className="block text-sm text-white/60">
          <span className="font-medium text-white/80">Show title</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSelectedTmdbId(null);
              setSelectedMeta(null);
              if (error) setError(null);
            }}
            placeholder="e.g., The Boys"
            disabled={isComparing}
            className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-base outline-none focus:border-white/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </label>
        {searchResults.length > 0 ? (
          <div className="rounded-xl border border-white/15 bg-black/80 backdrop-blur max-h-72 overflow-auto">
            {searchResults.map((r) => (
              <button
                key={r.tmdbId}
                type="button"
                onClick={() => handleSelectResult(r)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/10"
              >
                {r.posterPath ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${r.posterPath}`}
                    alt=""
                    className="w-10 h-14 rounded bg-white/10 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-14 rounded bg-white/10 shrink-0" />
                )}

                <div className="min-w-0">
                  <div className="font-medium text-white truncate">
                    {r.title}{r.year ? ` (${r.year})` : ""}
                  </div>
                  <div className="text-xs text-white/50 line-clamp-2">
                    {r.overview}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
        {isSearching ? (
          <div className="text-xs text-white/50">Searching…</div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}

            {error.toLowerCase().includes("already ranked") ? (
              <div className="mt-2">
                <Link
                  href="/my-list"
                  className="inline-flex items-center rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
                >
                  View in My List →
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isComparing ? (
          <div className="space-y-3">
            <button
              onClick={handleStart}
              disabled={isWorking || !!error}
              className="w-full rounded-xl bg-white text-black font-medium px-4 py-3"
            >
              {hasShows ? "Start comparison" : "Add first show"}
            </button>

            <button
              onClick={handleAddToWantToWatch}
              disabled={isWorking || !!error}
              className="w-full rounded-xl bg-white/5 border border-white/10 font-medium px-4 py-3 text-white/90 hover:bg-white/10"
            >
              Add to Want to Watch
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white/70">
                  {isWorking ? "Placing…" : "Which did you like more?"}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0 || isWorking}
                    title={undoStack.length === 0 ? "Nothing to undo yet" : "Undo last step"}
                    className="rounded-xl bg-white/5 border border-white/10 font-medium px-3 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Undo
                  </button>

                  <button
                    type="button"
                    onClick={handleSkip}
                    disabled={isWorking}
                    className="rounded-xl bg-white/5 border border-white/10 font-medium px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    Skip
                  </button>
                </div>
              </div>

              <div className={
                "grid grid-cols-1 sm:grid-cols-2 gap-3 transition-opacity " +
                (isWorking ? "opacity-60 pointer-events-none" : "")
              }>
                <button
                  type="button"
                  onClick={() => handleAnswer("new")}
                  disabled={isWorking}
                  className="group rounded-2xl border border-white/15 bg-white/5 px-5 py-7 text-left hover:bg-white/10 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/30 active:scale-[0.99]"
                  aria-label={`Choose ${title.trim()}`}
                >
                  <div className="mt-2 text-2xl font-semibold text-white break-words">
                    {title.trim()}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleAnswer("existing")}
                  disabled={isWorking}
                  className="group rounded-2xl border border-white/15 bg-white/5 px-5 py-7 text-left hover:bg-white/10 hover:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/30 active:scale-[0.99]"
                  aria-label={`Choose ${comparisonShow?.title ?? "existing show"}`}
                >
                  <div className="mt-2 text-2xl font-semibold text-white break-words">
                    {comparisonShow?.title}
                  </div>
                </button>
              </div>
            </div>

            <p className="text-sm text-white/60">
              We’ll ask a few quick comparisons to place it correctly. Use Undo or Skip if you’re unsure.
            </p>
          </>
        )}
      </section>
    </div>
  );
}