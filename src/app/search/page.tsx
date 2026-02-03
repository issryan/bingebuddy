// src/app/search/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { ratingForIndex } from "@/core/logic/rating";

type TmdbResult = {
    tmdbId: number;
    title: string;
    year: string | null;
    posterPath: string | null;
    overview: string;
};

type UserResult = {
    username: string;
    user_id?: string;
};

type SearchType = "all" | "shows" | "users";

function getType(raw: string | null): SearchType {
    if (raw === "shows" || raw === "users" || raw === "all") return raw;
    return "all";
}

function ratingTextClass(rating: number) {
    if (rating >= 7) return "text-green-400";
    if (rating >= 4) return "text-yellow-300";
    return "text-red-400";
}

export default function SearchPage() {
    const router = useRouter();
    const sp = useSearchParams();

    const q = (sp.get("q") ?? "").trim();
    const type = getType(sp.get("type"));

    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState<TmdbResult[]>([]);
    const [userResults, setUserResults] = useState<UserResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [rankByTmdbId, setRankByTmdbId] = useState<Record<number, number>>({});
    const [rankedTotal, setRankedTotal] = useState<number>(0);

    const canSearch = q.length >= 2;

    const subtitle = useMemo(() => {
        if (!q) return "Search shows and friends.";
        if (!canSearch) return "Type at least 2 characters.";
        if (type === "shows") return `Searching shows for “${q}”`;
        if (type === "users") return `Searching users for “${q}”`;
        return `Searching everything for “${q}”`;
    }, [q, canSearch, type]);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            setError(null);
            setShowResults([]);
            setUserResults([]);
            setRankByTmdbId({});
            setRankedTotal(0);

            if (!canSearch) return;

            setLoading(true);
            try {
                // Shows (TMDB via your API route)
                if (type === "all" || type === "shows") {
                    const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(q)}`);
                    if (res.ok) {
                        const json = await res.json();
                        const results: TmdbResult[] = json.results ?? [];
                        if (!cancelled) setShowResults(results);

                        // If signed in, fetch which of these are already ranked.
                        try {
                            const { data: auth } = await supabase.auth.getUser();
                            const user = auth?.user ?? null;
                            if (user && results.length > 0) {
                                const ids = results
                                    .map((r) => Number(r.tmdbId))
                                    .filter((n) => Number.isFinite(n));

                                // Total ranked count (for derived rating display)
                                const { count } = await supabase
                                    .from("ranked_shows")
                                    .select("tmdb_id", { count: "exact", head: true })
                                    .eq("user_id", user.id);

                                if (!cancelled) setRankedTotal(count ?? 0);

                                // Rank positions for results
                                const { data: rankedRows } = await supabase
                                    .from("ranked_shows")
                                    .select("tmdb_id, rank_position")
                                    .eq("user_id", user.id)
                                    .in("tmdb_id", ids);

                                const map: Record<number, number> = {};
                                (rankedRows ?? []).forEach((row: any) => {
                                    const tidRaw = row?.tmdb_id;
                                    const posRaw = row?.rank_position;

                                    const tid = typeof tidRaw === "number" ? tidRaw : typeof tidRaw === "string" ? Number(tidRaw) : NaN;
                                    const pos = typeof posRaw === "number" ? posRaw : typeof posRaw === "string" ? Number(posRaw) : NaN;

                                    if (Number.isFinite(tid) && Number.isFinite(pos)) {
                                        map[tid] = pos;
                                    }
                                });

                                if (!cancelled) setRankByTmdbId(map);
                            }
                        } catch {
                            // ignore (search should still work when logged out)
                        }
                    }
                }

                // Users (Supabase profiles)
                if (type === "all" || type === "users") {
                    const { data, error: supaErr } = await supabase
                        .from("profiles")
                        .select("username,user_id")
                        .ilike("username", `%${q}%`)
                        .order("username", { ascending: true })
                        .limit(25);

                    if (supaErr) throw supaErr;

                    const users: UserResult[] =
                        (data ?? [])
                            .filter((x: any) => typeof x?.username === "string" && x.username.trim())
                            .map((x: any) => ({ username: x.username, user_id: x.user_id })) ?? [];

                    setUserResults(users);
                }
            } catch (e: any) {
                if (!cancelled) {
                    setError(e?.message ?? "Something went wrong while searching.");
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        void run();
        return () => {
            cancelled = true;
        };
    }, [q, type, canSearch]);

    function setFilter(next: SearchType) {
        const params = new URLSearchParams(sp.toString());
        params.set("type", next);
        router.push(`/search?${params.toString()}`);
    }

    function goRank(tmdbId: number) {
        router.push(`/log?tmdbId=${tmdbId}&auto=1`);
    }

    return (
        <div className="space-y-6">
            <div className="space-y-1">
                <h1 className="text-2xl font-semibold">Search</h1>
                <p className="text-white/70">{subtitle}</p>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setFilter("all")}
                    className={
                        type === "all"
                            ? "rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold"
                            : "rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    }
                >
                    All
                </button>
                <button
                    onClick={() => setFilter("shows")}
                    className={
                        type === "shows"
                            ? "rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold"
                            : "rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    }
                >
                    Shows
                </button>
                <button
                    onClick={() => setFilter("users")}
                    className={
                        type === "users"
                            ? "rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold"
                            : "rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                    }
                >
                    Users
                </button>
            </div>

            {/* Status */}
            {loading ? <div className="text-sm text-white/60">Searching…</div> : null}
            {error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
                </div>
            ) : null}

            {!q ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-white/70">
                    Try searching a show (e.g. “Power”) or a friend’s username.
                </div>
            ) : !canSearch ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-white/70">
                    Keep typing — we’ll search once you hit 2 characters.
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Users */}
                    {type !== "shows" ? (
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Users</h2>
                                <div className="text-sm text-white/50">{userResults.length} found</div>
                            </div>

                            {userResults.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/60">
                                    No users found.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {userResults.map((u) => (
                                        <Link
                                            key={u.username}
                                            href={`/u/${encodeURIComponent(u.username)}`}
                                            className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 hover:bg-white/[0.06]"
                                        >
                                            <div className="font-semibold">@{u.username}</div>
                                            <div className="text-sm text-white/50">View profile →</div>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </section>
                    ) : null}

                    {/* Shows */}
                    {type !== "users" ? (
                        <section className="space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Shows</h2>
                                <div className="text-sm text-white/50">{showResults.length} found</div>
                            </div>

                            {showResults.length === 0 ? (
                                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/60">
                                    No shows found.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {showResults.map((s) => {
                                        const rankPos = rankByTmdbId[Number(s.tmdbId)];
                                        const hasRank = typeof rankPos === "number" && Number.isFinite(rankPos);

                                        // rank_position is 0-based in the DB
                                        const displayRank = hasRank ? rankPos + 1 : null;

                                        const derived =
                                            hasRank && rankedTotal > 0
                                                ? ratingForIndex(rankPos, rankedTotal) // <-- use 0-based directly
                                                : null;

                                        return (
                                            <div
                                                key={s.tmdbId}
                                                className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                                            >
                                                <div className="flex items-stretch">
                                                    <Link
                                                        href={`/show/${s.tmdbId}`}
                                                        className="flex-1"
                                                    >
                                                        <div className="flex gap-3 p-4 items-start">
                                                            {s.posterPath ? (
                                                                <img
                                                                    src={`https://image.tmdb.org/t/p/w92${s.posterPath}`}
                                                                    alt=""
                                                                    className="h-14 w-10 rounded bg-white/10 object-cover shrink-0"
                                                                />
                                                            ) : (
                                                                <div className="h-14 w-10 rounded bg-white/10 shrink-0" />
                                                            )}

                                                            <div className="min-w-0 flex-1">
                                                                <div className="font-semibold leading-snug line-clamp-1">
                                                                    {s.title}
                                                                    {s.year ? <span className="text-white/60"> ({s.year})</span> : null}
                                                                </div>
                                                                <div className="text-sm text-white/60 line-clamp-2 min-h-[2.5rem]">
                                                                    {s.overview}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Link>

                                                    {/* Right-side action area */}
                                                    <div className="flex flex-col justify-center gap-2 px-4 border-l border-white/10">
                                                        {hasRank ? (
                                                            <div className="flex items-center justify-center">
                                                                <div
                                                                    className={
                                                                        "h-11 w-11 rounded-full border border-white/15 flex items-center justify-center text-sm font-semibold " +
                                                                        (derived !== null ? ratingTextClass(derived) : "text-white/70")
                                                                    }
                                                                    title={derived !== null ? `Your rating: ${derived.toFixed(1)}` : "Ranked"}
                                                                >
                                                                    {derived !== null ? derived.toFixed(1) : "—"}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => goRank(s.tmdbId)}
                                                                className="h-11 w-11 rounded-full bg-white text-black text-lg font-semibold hover:opacity-90"
                                                                aria-label={`Rank ${s.title}`}
                                                                title={`Rank ${s.title}`}
                                                            >
                                                                +
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    ) : null}
                </div>
            )}
        </div>
    );
}