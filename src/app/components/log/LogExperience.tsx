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

type WantToWatchItem = { id: string; title: string };

const WANT_TO_WATCH_KEY = "bingebuddy.wantToWatch";
const MAX_SKIPS_BEFORE_AUTOPLACE = 5;

function safeGetWantToWatch(): WantToWatchItem[] {
  try {
    const raw = localStorage.getItem(WANT_TO_WATCH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.id === "string" && typeof x.title === "string")
      .map((x) => ({ id: x.id, title: x.title }));
  } catch {
    return [];
  }
}

function safeSetWantToWatch(items: WantToWatchItem[]) {
  try {
    localStorage.setItem(WANT_TO_WATCH_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

function removeFromWantToWatchByTitle(title: string) {
  const clean = title.trim().toLowerCase();
  if (!clean) return;

  const current = safeGetWantToWatch();
  const next = current.filter((x) => x.title.trim().toLowerCase() !== clean);
  safeSetWantToWatch(next);
}

function makeId(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = crypto as any;
  return typeof c?.randomUUID === "function" ? c.randomUUID() : String(Date.now());
}

type UndoEntry = {
  session: CompareSession;
  skipped: number[]; // skipped compareIndex values within this session
};

export default function LogExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [title, setTitle] = useState("");
  const [session, setSession] = useState<CompareSession | null>(null);

  // Undo is only within the current session (in-memory)
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [skippedCompareIndexes, setSkippedCompareIndexes] = useState<number[]>([]);

  const [ranked, setRanked] = useState(() => getRankedShows(getState()));

  function refreshRanked() {
    setRanked(getRankedShows(getState()));
  }

  useEffect(() => {
    refreshRanked();
  }, []);

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

    // Once ranked, remove from Want to Watch
    removeFromWantToWatchByTitle(savedTitle);

    router.push(`/saved?${params.toString()}`);
  }

  function handleAddToWantToWatch() {
    const clean = title.trim();
    if (!clean) return;

    const current = safeGetWantToWatch();
    const exists = current.some(
      (x) => x.title.trim().toLowerCase() === clean.toLowerCase()
    );

    if (!exists) {
      safeSetWantToWatch([...current, { id: makeId(), title: clean }]);
    }

    setTitle("");
    setSession(null);
    setUndoStack([]);
    setSkippedCompareIndexes([]);
    router.push("/my-list");
  }

  function startWithTitle(clean: string) {
    if (!clean) return;

    // Prevent ranking duplicates
    const alreadyRanked = ranked.some(
      (s) => s.title.trim().toLowerCase() === clean.toLowerCase()
    );

    if (alreadyRanked) {
      removeFromWantToWatchByTitle(clean);
      setTitle("");
      setSession(null);
      setUndoStack([]);
      setSkippedCompareIndexes([]);
      router.push("/my-list");
      return;
    }

    if (ranked.length === 0) {
      addFirstShow(clean);
      setTitle("");
      setSession(null);
      setUndoStack([]);
      setSkippedCompareIndexes([]);
      goToSavedScreen(clean);
      return;
    }

    const s = startComparisonSession(clean);
    if (!s) return;

    setSession(s);
    setUndoStack([]);
    setSkippedCompareIndexes([]);
  }

  function handleStart() {
    startWithTitle(title.trim());
  }

  function handleAnswer(preference: Preference) {
    if (!session) return;

    // Save for undo (including skipped memory)
    setUndoStack((prev) => [...prev, { session, skipped: skippedCompareIndexes }]);

    const next = applyComparisonAnswer(session, preference);

    if (next === null) {
      const savedTitle = title.trim();
      setSession(null);
      setUndoStack([]);
      setSkippedCompareIndexes([]);
      setTitle("");
      goToSavedScreen(savedTitle);
    } else {
      setSession(next);
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
      } else {
        setSkippedCompareIndexes(nextSkipped);
        setSession(done);
      }

      return;
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
    } else {
      // Should be rare, but keep safe
      setSkippedCompareIndexes(nextSkipped);
      setSession(done);
    }
  }

  // Prefill + auto-start from /log?title=...&auto=1
  useEffect(() => {
    const prefill = searchParams.get("title");
    const auto = searchParams.get("auto") === "1";

    if (!prefill) return;

    if (session === null && title.trim() === "") {
      setTitle(prefill);

      if (auto) {
        startWithTitle(prefill.trim());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, session, ranked.length]);

  const hasShows = ranked.length > 0;
  const isComparing = session !== null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 space-y-4">
        <label className="block text-sm text-white/70">
          Show title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., The Boys"
            disabled={isComparing}
            className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-base outline-none focus:border-white/30 disabled:opacity-60 disabled:cursor-not-allowed"
          />
        </label>

        {!isComparing ? (
          <div className="space-y-3">
            <button
              onClick={handleStart}
              className="w-full rounded-xl bg-white text-black font-medium px-4 py-3"
            >
              {hasShows ? "Start comparison" : "Add first show"}
            </button>

            <button
              onClick={handleAddToWantToWatch}
              className="w-full rounded-xl bg-white/10 border border-white/15 font-medium px-4 py-3"
            >
              Add to Want to Watch
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-white/70">Which did you like more?</div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={undoStack.length === 0}
                    title={undoStack.length === 0 ? "Nothing to undo yet" : "Undo last step"}
                    className="rounded-xl bg-white/10 border border-white/15 font-medium px-3 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Undo
                  </button>

                  <button
                    type="button"
                    onClick={handleSkip}
                    className="rounded-xl bg-white/10 border border-white/15 font-medium px-3 py-2 text-sm"
                  >
                    Skip
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleAnswer("new")}
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
              We may ask a few quick comparisons to place it correctly. You can Undo or Skip if
              you’re unsure.
            </p>
          </>
        )}
      </section>
    </div>
  );
}