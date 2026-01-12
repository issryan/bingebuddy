"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRankedShows, getState, reorderShows } from "@/core/logic/state";
import RankedDragList from "./RankedDragList";
import { safeGetWantToWatch, type WantToWatchItem } from "@/core/storage/wantToWatchStorage";

const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";

function posterUrl(path: string | null | undefined, size: "w92" | "w154" = "w92"): string | null {
  if (!path) return null;
  return `${TMDB_IMG_BASE}/${size}${path}`;
}

function genresLabel(genres: string[] | undefined): string {
  if (!genres || genres.length === 0) return "";
  return genres.slice(0, 2).join(" • ");
}

function ratingBadgeClass(rating: number): string {
  if (rating >= 7) return "border-green-400/40 text-green-300";
  if (rating >= 4) return "border-yellow-400/40 text-yellow-300";
  return "border-red-400/40 text-red-300";
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
                {ranked.map((s, i) => {
                  const img = posterUrl(s.posterPath, "w92");
                  const metaLine = [s.year ? s.year : "", genresLabel(s.genres)].filter(Boolean).join(" • ");
                  const canOpen = typeof s.tmdbId === "number" && s.tmdbId > 0;

                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!canOpen) return;
                          router.push(`/show/${s.tmdbId}`);
                        }}
                        className={
                          "w-full flex items-center justify-between gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-left " +
                          (canOpen ? "hover:bg-white/10 hover:border-white/20" : "cursor-default")
                        }
                        aria-label={canOpen ? `Open details for ${s.title}` : undefined}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Poster */}
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              className="w-10 h-14 rounded bg-white/10 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-14 rounded bg-white/10 shrink-0" />
                          )}

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-white/60 shrink-0">#{i + 1}</span>
                              <span className="font-medium truncate">{s.title}</span>
                            </div>

                            {metaLine ? (
                              <div className="mt-0.5 text-xs text-white/50 truncate">{metaLine}</div>
                            ) : null}
                          </div>
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
                      </button>
                    </li>
                  );
                })}
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
                    {(() => {
                      const img = posterUrl(item.posterPath, "w92");
                      const metaLine = [
                        item.year ? item.year : "",
                        genresLabel(item.genres),
                      ]
                        .filter(Boolean)
                        .join(" • ");
                      const canOpen = typeof item.tmdbId === "number" && item.tmdbId > 0;

                      return (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (!canOpen) return;
                              router.push(`/show/${item.tmdbId}`);
                            }}
                            className={
                              "flex items-center gap-3 min-w-0 text-left " +
                              (canOpen ? "hover:opacity-90" : "cursor-default")
                            }
                            aria-label={canOpen ? `Open details for ${item.title}` : undefined}
                          >
                            {img ? (
                              <img
                                src={img}
                                alt=""
                                className="w-10 h-14 rounded bg-white/10 object-cover shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-14 rounded bg-white/10 shrink-0" />
                            )}

                            <div className="min-w-0">
                              <div className="font-medium truncate">{item.title}</div>
                              {metaLine ? (
                                <div className="mt-0.5 text-xs text-white/50 truncate">{metaLine}</div>
                              ) : null}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const params = new URLSearchParams();
                              if (item.tmdbId) {
                                params.set("tmdbId", String(item.tmdbId));
                              } else {
                                params.set("title", item.title);
                              }
                              params.set("auto", "1");
                              router.push(`/log?${params.toString()}`);
                            }}
                            className="shrink-0 rounded-xl bg-white text-black font-medium px-3 py-2 text-sm"
                          >
                            Rank
                          </button>
                        </>
                      );
                    })()}
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