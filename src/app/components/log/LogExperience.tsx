"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Preference } from "@/core/logic/ranking";
import {
    addFirstShow,
    applyComparisonAnswer,
    getRankedShows,
    getState,
    startComparisonSession,
    type CompareSession,
} from "@/core/logic/state";

export default function LogExperience() {
    const router = useRouter();

    const [title, setTitle] = useState("");
    const [session, setSession] = useState<CompareSession | null>(null);
    const [ranked, setRanked] = useState(() => getRankedShows(getState()));

    function refresh() {
        setRanked(getRankedShows(getState()));
    }

    useEffect(() => {
        refresh();
    }, []);

    const comparisonShow = useMemo(() => {
        if (!session) return null;
        const state = getState();
        return state.shows[session.compareIndex] ?? null;
    }, [session]);

    function goToSavedScreen(savedTitle: string) {
        const nextRanked = getRankedShows(getState());
        setRanked(nextRanked);

        // Find where the show landed (title match for now)
        const index = nextRanked.findIndex((s) => s.title === savedTitle);

        const params = new URLSearchParams();
        params.set("title", savedTitle);

        if (index !== -1) {
            params.set("rank", String(index + 1));
            params.set("rating", String(nextRanked[index].rating));
        }

        router.push(`/saved?${params.toString()}`);
    }

    function handleStart() {
        const clean = title.trim();
        if (!clean) return;

        if (ranked.length === 0) {
            addFirstShow(clean);
            setTitle("");
            setSession(null);

            goToSavedScreen(clean);
            return;
        }

        const s = startComparisonSession(clean);
        setSession(s);
    }

    function handleAnswer(preference: Preference) {
        if (!session) return;

        const next = applyComparisonAnswer(session, preference);

        if (next === null) {
            const savedTitle = title.trim();

            setSession(null);
            setTitle("");

            goToSavedScreen(savedTitle);
        } else {
            setSession(next);
        }
    }

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

                {!hasShows ? (
                    <button
                        onClick={handleStart}
                        className="w-full rounded-xl bg-white text-black font-medium px-4 py-3"
                    >
                        Add first show
                    </button>
                ) : !isComparing ? (
                    <button
                        onClick={handleStart}
                        className="w-full rounded-xl bg-white text-black font-medium px-4 py-3"
                    >
                        Start comparison
                    </button>
                ) : (
                    <>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="text-sm text-white/70">Which did you like more?</div>
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
                            We may ask a few quick comparisons to place it correctly.
                        </p>
                    </>
                )}
            </section>
        </div>
    );
}