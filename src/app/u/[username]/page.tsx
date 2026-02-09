"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import UserFriendActions from "@/app/components/user/UserFriendActions";
import { supabase } from "@/lib/supabaseClient";

function ratingColor(rating: number) {
  if (rating >= 7) return "text-emerald-300";
  if (rating >= 4) return "text-yellow-300";
  return "text-red-300";
}

function RatingBadge({ rating }: { rating: number }) {
  const color = ratingColor(rating);
  return (
    <div className="shrink-0 w-11 h-11 rounded-full border border-white/15 bg-white/[0.04] flex items-center justify-center">
      <span className={`text-sm font-semibold ${color}`}>{rating.toFixed(1)}</span>
    </div>
  );
}

function tmdbPosterUrl(path: string) {
  return `https://image.tmdb.org/t/p/w185${path}`;
}

type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string | null;
};

type ActivityRow = {
  id: string;
  created_at: string;
  tmdb_id: number;
  show_title: string;
  poster_path: string | null;
  year: string | null;
  derived_rating: number | null;
};

export default function UserProfilePage() {
  const router = useRouter();
  const params = useParams<{ username: string }>();

  const username = useMemo(() => {
    const raw = typeof params?.username === "string" ? params.username : "";
    return decodeURIComponent(raw).trim().toLowerCase();
  }, [params?.username]);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // null = locked by RLS, number = visible
  const [rankedCount, setRankedCount] = useState<number | null>(null);
  const [wantToWatchCount, setWantToWatchCount] = useState<number | null>(null);
  const [statsLocked, setStatsLocked] = useState(false);

  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityLocked, setActivityLocked] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!username) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotFound(false);
      setProfile(null);
      setStatsLocked(false);
      setRankedCount(null);
      setWantToWatchCount(null);
      setActivityRows([]);
      setActivityLocked(false);

      // 1) Profile by username
      const prof = await supabase
        .from("profiles")
        .select("user_id, username, display_name")
        .eq("username", username)
        .maybeSingle();

      if (!alive) return;

      if (prof.error || !prof.data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const p = prof.data as ProfileRow;
      setProfile(p);

      // 2) Stats (friends-only via RLS)
      const [rankedRes, wtwRes] = await Promise.all([
        supabase
          .from("ranked_shows")
          .select("*", { count: "exact", head: true })
          .eq("user_id", p.user_id),
        supabase
          .from("want_to_watch")
          .select("*", { count: "exact", head: true })
          .eq("user_id", p.user_id),
      ]);

      if (!alive) return;

      const locked = !!(rankedRes.error || wtwRes.error);
      setStatsLocked(locked);

      setRankedCount(rankedRes.error ? null : (rankedRes.count ?? 0));
      setWantToWatchCount(wtwRes.error ? null : (wtwRes.count ?? 0));

      // 3) Recent activity (friends-only via RLS)
      const act = await supabase
        .from("activity_events")
        .select("id, created_at, tmdb_id, show_title, poster_path, year, derived_rating")
        .eq("actor_user_id", p.user_id)
        .order("created_at", { ascending: false })
        .limit(15);

      if (!alive) return;

      if (act.error) {
        setActivityLocked(true);
      } else {
        setActivityLocked(false);
        setActivityRows((act.data ?? []) as ActivityRow[]);
      }

      setLoading(false);
    }

    void load();

    return () => {
      alive = false;
    };
  }, [username]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 text-white/70">
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-3">
          <div className="text-xl font-semibold">User not found</div>
          <div className="text-sm text-white/60">We couldn’t find @{username || "…"}.</div>
          <button
            onClick={() => router.push("/search")}
            className="inline-flex w-fit rounded-xl bg-white/10 border border-white/15 px-4 py-2 text-sm"
          >
            Back to search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <h1 className="text-2xl font-semibold truncate">@{profile.username}</h1>
            {profile.display_name ? (
              <div className="text-white/70 truncate">{profile.display_name}</div>
            ) : (
              <div className="text-white/50 text-sm"> </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/50">Ranked</div>
            <div className="mt-1 text-2xl font-semibold">{rankedCount == null ? "—" : rankedCount}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-white/50">Want to watch</div>
            <div className="mt-1 text-2xl font-semibold">{wantToWatchCount == null ? "—" : wantToWatchCount}</div>
          </div>
        </div>

        {statsLocked ? (
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
            Stats are private right now (friends-only). If you and this user are friends and you still see this, your RLS
            policies for <code className="font-mono">ranked_shows</code>/<code className="font-mono">want_to_watch</code> likely
            aren’t allowing friends to read.
          </div>
        ) : null}

        <div className="pt-1">
          <UserFriendActions targetUserId={profile.user_id} targetUsername={profile.username} />
        </div>
      </div>

      <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent activity</h2>
        </div>

        {activityLocked ? (
          <div className="text-sm text-white/60">Activity is private (friends-only).</div>
        ) : activityRows.length === 0 ? (
          <div className="text-sm text-white/60">No activity yet.</div>
        ) : (
          <div className="space-y-3">
            {activityRows.map((e) => {
              const tmdbId = typeof e.tmdb_id === "number" ? e.tmdb_id : Number(e.tmdb_id);
              const rating = typeof e.derived_rating === "number" ? e.derived_rating : e.derived_rating != null ? Number(e.derived_rating) : null;

              return (
                <Link
                  key={String(e.id)}
                  href={`/show/${tmdbId}`}
                  className="block rounded-2xl border border-white/10 bg-black/20 hover:bg-white/[0.06] transition px-4 py-3"
                >
                  <div className="flex items-center gap-4">
                    {e.poster_path ? (
                      <img
                        src={tmdbPosterUrl(String(e.poster_path))}
                        alt=""
                        className="w-12 h-16 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-16 rounded-lg bg-white/5 border border-white/10 shrink-0" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">
                        {String(e.show_title ?? "Untitled")}
                        {e.year ? <span className="text-white/60"> ({String(e.year)})</span> : null}
                      </div>
                      <div className="text-xs text-white/50 mt-1">Ranked</div>
                    </div>

                    {rating != null ? <RatingBadge rating={rating} /> : null}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}