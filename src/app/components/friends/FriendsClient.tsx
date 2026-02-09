

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type FriendProfile = {
  userId: string;
  username: string;
  displayName?: string | null;
};

type FriendshipRowV1 = {
  user_id_a: string;
  user_id_b: string;
  created_at?: string;
};

type FriendshipRowV2 = {
  user_low: string;
  user_high: string;
  created_at?: string;
};

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export default function FriendsClient() {
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  // Keep track of which friendship schema we successfully used.
  const [schema, setSchema] = useState<"v2" | "v1" | null>(null);

  const hasFriends = friends.length > 0;

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setError(null);

      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;

      if (!alive) return;

      if (!user) {
        setMe(null);
        setFriends([]);
        setLoading(false);
        setError("You must be signed in.");
        return;
      }

      setMe(user.id);

      // 1) Load friendships (try v2 first: user_low/user_high)
      const tryV2 = await supabase
        .from("friendships")
        .select("user_low, user_high, created_at")
        .or(`user_low.eq.${user.id},user_high.eq.${user.id}`);

      let friendIds: string[] = [];

      if (!tryV2.error) {
        setSchema("v2");
        const rows = (tryV2.data ?? []) as FriendshipRowV2[];
        friendIds = rows
          .map((r) => (r.user_low === user.id ? r.user_high : r.user_low))
          .filter(Boolean);
      } else {
        // 2) Fallback to v1: user_id_a/user_id_b
        const tryV1 = await supabase
          .from("friendships")
          .select("user_id_a, user_id_b, created_at")
          .or(`user_id_a.eq.${user.id},user_id_b.eq.${user.id}`);

        if (tryV1.error) {
          setSchema(null);
          setFriends([]);
          setLoading(false);
          setError(tryV1.error.message);
          return;
        }

        setSchema("v1");
        const rows = (tryV1.data ?? []) as FriendshipRowV1[];
        friendIds = rows
          .map((r) => (r.user_id_a === user.id ? r.user_id_b : r.user_id_a))
          .filter(Boolean);
      }

      const uniqueFriendIds = uniq(friendIds);

      if (uniqueFriendIds.length === 0) {
        setFriends([]);
        setLoading(false);
        return;
      }

      // 3) Load profiles for friends
      const profRes = await supabase
        .from("profiles")
        .select("user_id, username, display_name")
        .in("user_id", uniqueFriendIds);

      if (profRes.error) {
        setFriends([]);
        setLoading(false);
        setError(profRes.error.message);
        return;
      }

      const mapped: FriendProfile[] = (profRes.data ?? [])
        .map((p: any) => ({
          userId: String(p.user_id),
          username: String(p.username ?? ""),
          displayName: typeof p.display_name === "string" ? p.display_name : null,
        }))
        .filter((p) => p.userId && p.username)
        .sort((a, b) => a.username.localeCompare(b.username));

      setFriends(mapped);
      setLoading(false);
    }

    void run();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void run();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const emptyCopy = useMemo(() => {
    return "No friends yet. Search a username and add them.";
  }, []);

  async function unfollow(targetUserId: string) {
    if (!me) return;

    setRemoving((prev) => ({ ...prev, [targetUserId]: true }));
    setError(null);

    try {
      // Delete the friendship row in whichever schema is active.
      if (schema === "v2") {
        const low = me < targetUserId ? me : targetUserId;
        const high = me < targetUserId ? targetUserId : me;

        const del = await supabase
          .from("friendships")
          .delete()
          .eq("user_low", low)
          .eq("user_high", high);

        if (del.error) throw new Error(del.error.message);
      } else {
        // v1 fallback: delete either orientation
        const del = await supabase
          .from("friendships")
          .delete()
          .or(
            `and(user_id_a.eq.${me},user_id_b.eq.${targetUserId}),and(user_id_a.eq.${targetUserId},user_id_b.eq.${me})`
          );

        if (del.error) throw new Error(del.error.message);
      }

      // Optimistic remove from UI
      setFriends((prev) => prev.filter((f) => f.userId !== targetUserId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unfollow.");
    } finally {
      setRemoving((prev) => ({ ...prev, [targetUserId]: false }));
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Friends</h1>
        <p className="text-sm text-white/60">
          People you’re connected with. Tap a friend to view their profile.
        </p>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-6">
        {loading ? (
          <div className="text-sm text-white/60">Loading…</div>
        ) : !hasFriends ? (
          <div className="text-sm text-white/60">{emptyCopy}</div>
        ) : (
          <div className="space-y-2">
            {friends.map((f) => (
              <div
                key={f.userId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/u/${encodeURIComponent(f.username)}`}
                    className="block text-sm font-semibold text-white/90 hover:underline"
                  >
                    @{f.username}
                  </Link>
                  {f.displayName ? (
                    <div className="mt-1 text-xs text-white/50 truncate">
                      {f.displayName}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => unfollow(f.userId)}
                  disabled={!!removing[f.userId]}
                  className="shrink-0 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-60"
                >
                  {removing[f.userId] ? "Removing…" : "Unfollow"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}