"use client";

import { useEffect, useMemo, useState } from "react";
import type { Preference } from "@/core/logic/ranking";
import {
  addFirstShow,
  applyComparisonAnswer,
  getRankedShows,
  getState,
  startComparisonSession,
  type CompareSession,
} from "@/core/logic/state";

import { clearState } from "@/core/storage/localStorage";

/**
 * Sprint 1 Test UI (Comparison Model)
 * ----------------------------------
 * This UI is intentionally simple.
 * Its ONLY purpose is to verify:
 * - order-based ranking
 * - app-driven comparisons
 * - derived ratings
 *
 * This is NOT the final product UI.
 */
export default function Home() {
  /** The new show title typed by the user */
  const [title, setTitle] = useState("");

  /** Temporary comparison session (null when not comparing) */
  const [session, setSession] = useState<CompareSession | null>(null);

  /** Ranked list for display (derived from stored order) */
  const [ranked, setRanked] = useState(() => getRankedShows(getState()));

  /**
   * Refresh UI state from localStorage.
   * This is our single source of truth in v1.
   */
  function refresh() {
    const state = getState();
    setRanked(getRankedShows(state));
  }

  /** Load initial state on first render */
  useEffect(() => {
    refresh();
  }, []);

  /**
   * The show the app has chosen to compare against.
   * Chosen via binary-search logic in state.ts.
   */
  const comparisonShow = useMemo(() => {
    if (!session) return null;
    const state = getState();
    return state.shows[session.compareIndex] ?? null;
  }, [session]);

  /**
   * Handle starting the flow:
   * - If no shows exist → add first show
   * - Otherwise → start a comparison session
   */
  function handleStart() {
    if (!title.trim()) return;

    if (ranked.length === 0) {
      addFirstShow(title);
      setTitle("");
      refresh();
      return;
    }

    const s = startComparisonSession(title);
    setSession(s);
  }

  /**
   * Apply one comparison answer.
   * The app will either:
   * - ask another comparison, OR
   * - insert the show and finish
   */
  function handleAnswer(preference: Preference) {
    if (!session) return;

    const next = applyComparisonAnswer(session, preference);

    if (next === null) {
      // Finished inserting
      setSession(null);
      setTitle("");
      refresh();
    } else {
      // Continue comparison flow
      setSession(next);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <header className="rounded-2xl border border-white/15 p-6">
          <h1 className="text-3xl font-semibold">BingeBuddy</h1>
          <p className="mt-2 text-white/70">
            Sprint 1 — app-driven comparison ranking
          </p>
          <button
            onClick={() => {
              clearState();
              window.location.reload();
            }}
            className="rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm"
          >
            Reset (dev)
          </button>
        </header>

        {/* Input + Controls */}
        <section className="rounded-2xl border border-white/15 p-6 space-y-4">
          <label className="block text-sm text-white/70">
            Show title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., The Boys"
              className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
            />
          </label>

          {/* No shows yet */}
          {ranked.length === 0 ? (
            <button
              onClick={handleStart}
              className="w-full rounded-xl bg-white text-black font-medium px-4 py-3"
            >
              Add first show
            </button>
          ) : session === null ? (
            /* Start comparison */
            <button
              onClick={handleStart}
              className="w-full rounded-xl bg-white text-black font-medium px-4 py-3"
            >
              Start comparison
            </button>
          ) : (
            /* Active comparison */
            <>
              <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm">
                Compare your new show against:
                <div className="mt-1 text-white font-medium">
                  #{session.compareIndex + 1} — {comparisonShow?.title}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleAnswer("new")}
                  className="rounded-xl bg-white text-black font-medium px-4 py-3"
                >
                  New is better ↑
                </button>
                <button
                  onClick={() => handleAnswer("existing")}
                  className="rounded-xl bg-white/10 border border-white/15 font-medium px-4 py-3"
                >
                  Existing is better ↓
                </button>
              </div>

              <p className="text-sm text-white/60">
                The app will keep asking until it finds the correct spot.
              </p>
            </>
          )}
        </section>

        {/* Current ranking */}
        <section className="rounded-2xl border border-white/15 p-6">
          <h2 className="text-lg font-semibold">Current ranking</h2>

          {ranked.length === 0 ? (
            <p className="mt-3 text-white/60">
              No shows yet. Add your first one.
            </p>
          ) : (
            <ol className="mt-4 space-y-2">
              {ranked.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white/60">#{i + 1}</span>
                    <span className="font-medium">{s.title}</span>
                  </div>
                  <div className="text-white/70">{s.rating}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}