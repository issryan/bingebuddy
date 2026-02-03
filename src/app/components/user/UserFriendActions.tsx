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
    // We support either one-row or two-row friendship storage by checking both directions.
    const { data: friendRows } = await supabase
      .from("friendships")
      .select("id,user_id,friend_user_id")
      .or(
        `and(user_id.eq.${me},friend_user_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_user_id.eq.${me})`
      )
      .limit(1);

    if ((friendRows ?? []).length > 0) {
      setStatus("friends");
      return;
    }

    // 2) Is there a pending outgoing request?
    const { data: outReq } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("sender_user_id", me)
      .eq("receiver_user_id", targetUserId)
      .limit(1);

    if ((outReq ?? []).length > 0) {
      setStatus("outgoing_pending");
      return;
    }

    // 3) Is there a pending incoming request?
    const { data: inReq } = await supabase
      .from("friend_requests")
      .select("id")
      .eq("sender_user_id", targetUserId)
      .eq("receiver_user_id", me)
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
        sender_user_id: currentUserId,
        receiver_user_id: targetUserId,
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

      // create friendship(s)
      // If your schema expects one row, the first insert is enough.
      // If it expects two rows, this covers it.
      await supabase.from("friendships").insert([
        { user_id: currentUserId, friend_user_id: targetUserId },
        { user_id: targetUserId, friend_user_id: currentUserId },
      ]);

      // delete request
      await supabase.from("friend_requests").delete().eq("id", incomingRequestId);

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

      await supabase.from("friend_requests").delete().eq("id", incomingRequestId);

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