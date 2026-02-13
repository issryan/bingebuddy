import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (String(body?.confirm ?? "").toLowerCase() !== "delete") {
      return NextResponse.json({ error: "Confirmation required." }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anon || !service) {
      return NextResponse.json({ error: "Server missing Supabase env vars." }, { status: 500 });
    }

    // 1) Identify the user making the request (using their session token)
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!jwt) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const userScoped = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await userScoped.auth.getUser();
    const userId = userData?.user?.id;

    if (userErr || !userId) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    // 2) Admin client (can delete everything)
    const admin = createClient(url, service);

    // Delete DB rows first (order matters because of foreign keys)
    const deletions = [
      admin.from("activity_events").delete().eq("actor_user_id", userId),
      admin.from("friend_requests").delete().or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`),
      admin.from("friendships").delete().or(`user_low.eq.${userId},user_high.eq.${userId}`),
      admin.from("ranked_shows").delete().eq("user_id", userId),
      admin.from("want_to_watch").delete().eq("user_id", userId),
      admin.from("shows").delete().eq("user_id", userId),
      admin.from("profiles").delete().eq("user_id", userId),
    ];

    for (const op of deletions) {
      const { error } = await op;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // 3) Finally delete the Auth user
    const { error: delUserErr } = await admin.auth.admin.deleteUser(userId);
    if (delUserErr) {
      return NextResponse.json({ error: delUserErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}