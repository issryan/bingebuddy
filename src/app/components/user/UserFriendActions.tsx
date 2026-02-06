"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/core/storage/supabaseClient";

type Props = {
  targetUserId: string;
  targetUsername: string;
};

type Status =
  | "loading"
  | "self"
  | "friends"
  | "none"
  | "outgoing_pending"
  | "incoming_pending";

function pair(me: string, other: string) {
  const low = me < other ? me : other;
  const high = me < other ? other : me;
  return { low, high };
}

function nowIso() {
  return new Date().toISOString();
}

export default function UserFriendActions({ targetUserId, targetUsername }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setStatus("loading");
    setIncomingRequestId(null);

    const { data } = await supabase.auth.getUser();
    const me = data.user?.id ?? null;
    setCurrentUserId(me);

    if (!me) {
      // In your app, layout should prevent this, but keep safe.
      setStatus("none");
      return;
    }

    if (me === targetUserId) {
      setStatus("self");
      return;
    }

    // 1) Are we already friends?
    // Friendships are stored as a single row with (user_low, user_high)
    const { low, high } = pair(me, targetUserId);

    const { data: friendRows } = await supabase
      .from("friendships")
      .select("user_low,user_high")
      .eq("user_low", low)
      .eq("user_high", high)
      .limit(1);

    if ((friendRows ?? []).length > 0) {
      setStatus("friends");
      return;
    }

    // 2) Is there a pending outgoing request?
    const { data: outReq } = await supabase
      .from("friend_requests")
      .select("id,status")
      .eq("from_user_id", me)
      .eq("to_user_id", targetUserId)
      .eq("status", "pending")
      .limit(1);

    if ((outReq ?? []).length > 0) {
      setStatus("outgoing_pending");
      return;
    }

    // 3) Is there a pending incoming request?
    const { data: inReq } = await supabase
      .from("friend_requests")
      .select("id,status")
      .eq("from_user_id", targetUserId)
      .eq("to_user_id", me)
      .eq("status", "pending")
      .limit(1);

    if ((inReq ?? []).length > 0) {
      setIncomingRequestId(inReq![0].id);
      setStatus("incoming_pending");
      return;
    }

    setStatus("none");
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId]);

  async function sendRequest() {
    if (!currentUserId) return;
    try {
      setBusy(true);
      setError(null);

      await supabase.from("friend_requests").insert({
        from_user_id: currentUserId,
        to_user_id: targetUserId,
        status: "pending",
      });

      await refresh();
    } catch {
      setError("Couldn’t send request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function acceptRequest() {
    if (!currentUserId || !incomingRequestId) return;

    try {
      setBusy(true);
      setError(null);

      // create friendship (single-row, ordered pair)
      const { low, high } = pair(currentUserId, targetUserId);
      await supabase.from("friendships").insert({ user_low: low, user_high: high });

      // mark request accepted
      await supabase
        .from("friend_requests")
        .update({ status: "accepted", responded_at: nowIso() })
        .eq("id", incomingRequestId);

      await refresh();
    } catch {
      setError("Couldn’t accept request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function declineRequest() {
    if (!incomingRequestId) return;

    try {
      setBusy(true);
      setError(null);

      await supabase
        .from("friend_requests")
        .update({ status: "declined", responded_at: nowIso() })
        .eq("id", incomingRequestId);

      await refresh();
    } catch {
      setError("Couldn’t decline request. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const label = useMemo(() => {
    if (status === "loading") return "Loading…";
    if (status === "self") return "This is you";
    if (status === "friends") return "Friends";
    if (status === "outgoing_pending") return "Requested";
    if (status === "incoming_pending") return "Respond to request";
    return "Add friend";
  }, [status]);

  if (status === "incoming_pending") {
    return (
      <div className="space-y-2">
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={acceptRequest}
            disabled={busy}
            className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={declineRequest}
            disabled={busy}
            className="rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60"
          >
            Decline
          </button>
        </div>
      </div>
    );
  }

  const disabled =
    busy || status === "loading" || status === "self" || status === "friends" || status === "outgoing_pending";

  return (
    <div className="space-y-2">
      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        onClick={status === "none" ? sendRequest : undefined}
        disabled={disabled}
        className={
          status === "none"
            ? "rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold disabled:opacity-60"
            : "rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-sm text-white/70 disabled:opacity-60"
        }
      >
        {label}
      </button>

      {status === "none" ? (
        <div className="text-xs text-white/50">
          Send a request to @{targetUsername}.
        </div>
      ) : null}
    </div>
  );
}