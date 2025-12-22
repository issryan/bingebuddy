"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRankedShows, getState, reorderShows } from "@/core/logic/state";
import RankedDragList from "./RankedDragList";

type WantToWatchItem = { id: string; title: string };

const WANT_TO_WATCH_KEY = "bingebuddy.wantToWatch";

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

export default function MyListClient() {
  const router = useRouter();
  const [ranked, setRanked] = useState(() => getRankedShows(getState()));
  const [wantToWatch, setWantToWatch] = useState<WantToWatchItem[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);

  useEffect(() => {
    setRanked(getRankedShows(getState()));
    setWantToWatch(safeGetWantToWatch());
  }, []);

  return (
    <div className="space-y-6">
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

                <div className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-sm text-white/80">
                  Rating: {s.rating}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

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
    </div>
  );
}