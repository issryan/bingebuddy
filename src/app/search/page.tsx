// src/app/search/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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

export default function SearchPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const q = (sp.get("q") ?? "").trim();
  const type = getType(sp.get("type"));

  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState<TmdbResult[]>([]);
  const [userResults, setUserResults] = useState<UserResult[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      if (!canSearch) return;

      setLoading(true);
      try {
        // Shows (TMDB via your API route)
        if (type === "all" || type === "shows") {
          const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(q)}`);
          if (res.ok) {
            const json = await res.json();
            setShowResults(json.results ?? []);
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
                  {showResults.map((s) => (
                    <Link
                      key={s.tmdbId}
                      href={`/show/${s.tmdbId}`}
                      className="block rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                    >
                      <div className="flex gap-3 p-4">
                        {s.posterPath ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w92${s.posterPath}`}
                            alt=""
                            className="h-14 w-10 rounded bg-white/10 object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-14 w-10 rounded bg-white/10 shrink-0" />
                        )}

                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {s.title}
                            {s.year ? <span className="text-white/60"> ({s.year})</span> : null}
                          </div>
                          <div className="text-sm text-white/60 line-clamp-2">{s.overview}</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}