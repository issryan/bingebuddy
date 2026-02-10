"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRankedShows, getState, reorderShows } from "@/core/logic/state";
import RankedDragList from "./RankedDragList";
import type { WantToWatchItem } from "@/core/storage/wantToWatchStorage";
import { loadFromBackend, saveToBackend } from "@/core/storage/backendSync";
import { supabase } from "@/lib/supabaseClient";

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
  if (!Number.isFinite(rating)) return "border-white/15 text-white/60";
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
  const searchParams = useSearchParams();

  const [ranked, setRanked] = useState(() => getRankedShows(getState()));
  const [wantToWatch, setWantToWatch] = useState<WantToWatchItem[]>([]);
  const [isReorderMode, setIsReorderMode] = useState(false);

  type TabKey = "ranked" | "watch" | "recs";
  const [activeTab, setActiveTab] = useState<TabKey>("ranked");

  type RecItem = {
    tmdbId: number;
    title: string;
    year: string | null;
    posterPath: string | null;
    why?: string | null;
  };

  const [recs, setRecs] = useState<RecItem[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  const canShowRecs = useMemo(() => ranked.length >= 3, [ranked.length]);

  function getTabFromQuery(): TabKey {
    const raw = (searchParams.get("tab") ?? "").toLowerCase();
    if (raw === "watch") return "watch";
    if (raw === "recs") return "recs";
    return "ranked";
  }

  function replaceWithoutRefreshParam() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("refresh");
    const qs = next.toString();
    router.replace(qs ? `/my-list?${qs}` : "/my-list");
  }

  async function hydrateFromBackend(): Promise<void> {
    try {
      const sessionRes = await supabase.auth.getSession();
      const user = sessionRes.data.session?.user ?? null;
      if (!user) return;

      const res = await loadFromBackend(user.id);
      if (!res.ok) return;

      // ranked
      // Supabase only stores order (rank_position). Ratings are derived client-side.
      // So: write the loaded list into the in-memory ranking state, then re-derive.
      const loadedRanked = (res.data.state.shows ?? []) as any[];
      const state = getState() as any;
      state.shows = loadedRanked;
      setRanked(getRankedShows(state));

      // want to watch
      setWantToWatch(res.data.wantToWatch ?? []);
    } catch {
      // ignore
    }
  }

  async function saveSnapshotToCloud(): Promise<void> {
    try {
      const sessionRes = await supabase.auth.getSession();
      const user = sessionRes.data.session?.user ?? null;
      if (!user) return;

      const state = getState();
      const wtw = (wantToWatch ?? []).map((item) => ({
        ...item,
        overview: item.overview ?? "",
      }));
      await saveToBackend(user.id, state, wtw as any);

      // Immediately re-hydrate so this page reflects what Supabase accepted.
      await hydrateFromBackend();
    } catch {
      // silent — local-first UX
    }
  }

  async function loadRecs(): Promise<void> {
    if (!canShowRecs) {
      setRecs([]);
      setRecsLoading(false);
      setRecsError(null);
      return;
    }

    try {
      setRecsLoading(true);
      setRecsError(null);

      // Build top genres from ranked shows (server expects ?genres=...)
      const counts = new Map<string, number>();
      for (const s of ranked) {
        const gs = Array.isArray((s as any).genres) ? (s as any).genres : [];
        for (const g of gs) {
          if (typeof g !== "string") continue;
          const key = g.trim();
          if (!key) continue;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }

      const topGenres = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([g]) => g)
        .slice(0, 3);

      if (topGenres.length === 0) {
        setRecs([]);
        setRecsLoading(false);
        setRecsError(null);
        return;
      }

      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("genres", topGenres.join(","));

      const res = await fetch(`/api/tmdb/recommended-tv?${params.toString()}`, {
        cache: "no-store" as any,
      });

      if (!res.ok) {
        // Try to surface the real error (helps debugging)
        let detail = "";
        try {
          const j = await res.json();
          detail = typeof j?.error === "string" ? j.error : "";
        } catch {
          try {
            detail = await res.text();
          } catch {}
        }
        const msg = detail ? `Failed to load recommendations: ${detail}` : "Failed to load recommendations";
        throw new Error(msg);
      }

      const json = await res.json();
      const raw = Array.isArray(json?.results) ? json.results : [];

      const next: RecItem[] = raw
        .map((x: any) => ({
          tmdbId: Number(x.tmdbId ?? x.tmdb_id ?? x.id),
          title: String(x.title ?? x.name ?? ""),
          year: x.year ?? (typeof x.first_air_date === "string" ? x.first_air_date.slice(0, 4) : null),
          posterPath: x.posterPath ?? x.poster_path ?? null,
          why: typeof x.why === "string" ? x.why : null,
        }))
        .filter((x: RecItem) => Number.isFinite(x.tmdbId) && !!x.title);

      setRecs(next);
    } catch (e) {
      setRecs([]);
      setRecsError(e instanceof Error ? e.message : "Failed to load recommendations");
    } finally {
      setRecsLoading(false);
    }
  }

  useEffect(() => {
    // On first load, always hydrate from Supabase so this page reflects the source of truth.
    void hydrateFromBackend();
  }, []);

  useEffect(() => {
    const next = getTabFromQuery();
    setActiveTab(next);
    if (next !== "ranked") setIsReorderMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // If another page wants this screen to re-hydrate immediately after navigation,
    // it can navigate to /my-list?...&refresh=1. This avoids needing a manual reload.
    if (searchParams.get("refresh") === "1") {
      void (async () => {
        await hydrateFromBackend();
        replaceWithoutRefreshParam();
      })();
      return;
    }

    // Fallback: some flows may set a one-shot flag before navigating.
    if (typeof window !== "undefined") {
      const flag = window.sessionStorage.getItem("bingebuddy:refresh-mylist");
      if (flag) {
        window.sessionStorage.removeItem("bingebuddy:refresh-mylist");
        void hydrateFromBackend();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    function onChanged() {
      void hydrateFromBackend();
    }

    // When ranking/want-to-watch changes elsewhere, refresh this page.
    window.addEventListener("bingebuddy:state-changed", onChanged);

    // Also refresh when the tab regains focus (nice quality-of-life)
    window.addEventListener("focus", onChanged);

    return () => {
      window.removeEventListener("bingebuddy:state-changed", onChanged);
      window.removeEventListener("focus", onChanged);
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "recs") return;
    void loadRecs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canShowRecs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={tabClass(activeTab === "ranked")}
          onClick={() => {
            setIsReorderMode(false);
            setActiveTab("ranked");
            router.replace("/my-list");
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
            router.replace("/my-list?tab=watch");
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
            router.replace("/my-list?tab=recs");
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
                    void saveSnapshotToCloud();
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
                          {Number.isFinite(s.rating) ? Number(s.rating).toFixed(1) : "—"}
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
                            onClick={async () => {
                              const params = new URLSearchParams();
                              if (item.tmdbId) {
                                params.set("tmdbId", String(item.tmdbId));
                              } else {
                                params.set("title", item.title);
                              }
                              params.set("auto", "1");

                              // Ensure backend knows this item still exists before ranking flow mutates it
                              await saveSnapshotToCloud();
                              router.push(`/rank?${params.toString()}`);
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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recs</h2>

            {canShowRecs ? (
              <button
                type="button"
                onClick={() => void loadRecs()}
                disabled={recsLoading}
                className="rounded-xl bg-white/10 border border-white/15 font-medium px-3 py-2 text-sm disabled:opacity-60"
              >
                {recsLoading ? "Loading…" : "Refresh"}
              </button>
            ) : null}
          </div>

          {!canShowRecs ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-medium">Unlock recommendations</div>
              <div className="mt-1 text-sm text-white/60">
                Rank a few more shows to unlock personalized recs.
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => router.push("/rank")}
                  className="rounded-xl bg-white text-black font-medium px-3 py-2 text-sm"
                >
                  Rank a show
                </button>
              </div>
            </div>
          ) : recsError ? (
            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {recsError}
            </div>
          ) : recsLoading && recs.length === 0 ? (
            <div className="mt-3 text-sm text-white/60">Loading recommendations…</div>
          ) : recs.length === 0 ? (
            <div className="mt-3 text-sm text-white/60">
              No recommendations yet. Try ranking another show.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <div className="flex gap-3 pr-2">
                {recs.map((r) => {
                  const img = posterUrl(r.posterPath, "w154");
                  return (
                    <button
                      key={r.tmdbId}
                      type="button"
                      onClick={() => router.push(`/show/${r.tmdbId}`)}
                      className="w-[170px] shrink-0 text-left rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                    >
                      <div className="p-3 space-y-2">
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="w-full aspect-[2/3] rounded-xl object-cover bg-white/10"
                          />
                        ) : (
                          <div className="w-full aspect-[2/3] rounded-xl bg-white/10" />
                        )}

                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {r.title}
                          </div>
                          <div className="text-xs text-white/50 truncate">
                            {r.year ? r.year : ""}
                          </div>
                          {r.why ? (
                            <div className="mt-1 text-[11px] text-white/60 line-clamp-2">
                              {r.why}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}