// src/app/api/users/search/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("query") ?? "").trim().toLowerCase();

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { results: [], error: "Missing Supabase env vars" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .ilike("username", `%${query}%`)
    .order("username", { ascending: true })
    .limit(8);

  if (error) {
    return NextResponse.json({ results: [], error: error.message }, { status: 500 });
  }

  const results = (data ?? [])
    .map((r) => ({ username: r.username }))
    .filter((r) => typeof r.username === "string" && r.username.length > 0);

  return NextResponse.json({ results });
}