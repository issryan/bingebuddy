"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRankedShows, getState, reorderShows } from "@/core/logic/state";
import RankedDragList from "./RankedDragList";

type WantToWatchItem = { id: string; title: string };

const WANT_TO_WATCH_KEY = "bingebuddy.wantToWatch";

function ratingBadgeClass(rating: number): string {
  if (rating >= 7) return "border-green-400/40 text-green-300";
  if (rating >= 4) return "border-yellow-400/40 text-yellow-300";
  return "border-red-400/40 text-red-300";
}

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

function tabClass(active: boolean): string {
  return active
    ? "rounded-xl bg-white/10 border border-white/20 px-3 py-2 text-sm font-medium text-white"
    : "rounded-xl bg-transparent border border-white/10 px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white";
}

export default function MyListClient() {
  const router = useRouter();

  const [ranked, setRanked] = useState(() => getRankedShows(getState()));
  const [wantToWatch, setWantToWatch] = useState<WantToWatchItem[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);

  type TabKey = "ranked" | "watch" | "recs";
  const [activeTab, setActiveTab] = useState<TabKey>("ranked");

  useEffect(() => {
    setRanked(getRankedShows(getState()));
    setWantToWatch(safeGetWantToWatch());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={tabClass(activeTab === "ranked")}
          onClick={() => {
            setActiveTab("ranked");
          }}
        >
          Ranked
        </button>

        <button
          type="button"
          className={tabClass(activeTab === "watch")}
          onClick={() => {
            setIsReorderMode(false);
            setActiveTab("watch");
          }}
        >
          Want to Watch
        </button>

        <button
          type="button"
          className={tabClass(activeTab === "recs")}
          onClick={() => {
            setIsReorderMode(false);
            setActiveTab("recs");
          }}
        >
          Recs
        </button>
      </div>

      {activeTab === "ranked" ? (
        <>
          {/* Ranked / Watched */}
          <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Ranked</h2>

              {ranked.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setIsReorderMode((v) => !v)}
                  className={
                    isReorderMode
                      ? "rounded-xl bg-white text-black font-medium px-3 py-2 text-sm"
                      : "rounded-xl bg-white/10 border border-white/15 font-medium px-3 py-2 text-sm"
                  }
                >
                  {isReorderMode ? "Done" : "Reorder"}
                </button>
              ) : null}
            </div>

            {ranked.length === 0 ? (
              <p className="mt-3 text-white/60">No ranked shows yet.</p>
            ) : isReorderMode ? (
              <>
                <div className="mt-3 text-sm text-white/60">Drag shows to reorder.</div>
                <RankedDragList
                  ranked={ranked}
                  onCommitReorder={(from, to) => {
                    reorderShows(from, to);
                    setRanked(getRankedShows(getState()));
                  }}
                />
              </>
            ) : (
              <ol className="mt-4 space-y-2">
                {ranked.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-white/60 shrink-0">#{i + 1}</span>
                      <span className="font-medium truncate">{s.title}</span>
                    </div>

                    <div
                      className={
                        "shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-full border bg-white/5 text-sm font-semibold " +
                        ratingBadgeClass(s.rating)
                      }
                      aria-label={`Rating ${s.rating}`}
                      title={`Rating ${s.rating}`}
                    >
                      {Number(s.rating).toFixed(1)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      ) : null}

      {activeTab === "watch" ? (
        <>
          {/* Want to Watch / Bookmarked */}
          <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
            <h2 className="text-lg font-semibold">Want to Watch</h2>

            {wantToWatch.length === 0 ? (
              <p className="mt-3 text-white/60">No bookmarked shows yet.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {wantToWatch.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3"
                  >
                    <span className="font-medium">{item.title}</span>

                    <button
                      type="button"
                      onClick={() => {
                        const params = new URLSearchParams();
                        params.set("title", item.title);
                        params.set("auto", "1");
                        router.push(`/log?${params.toString()}`);
                      }}
                      className="shrink-0 rounded-xl bg-white text-black font-medium px-3 py-2 text-sm"
                    >
                      Rank
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {activeTab === "recs" ? (
        <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
          <h2 className="text-lg font-semibold">Recs</h2>
          <p className="mt-2 text-white/60">
            Recommendations are coming soon.
          </p>
          <p className="mt-1 text-sm text-white/40">
            (We’ll turn this on once TMDB is integrated.)
          </p>
        </section>
      ) : null}
    </div>
  );
}