import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // server-side client just for a quick sanity ping
  const supabase = createClient(url, key);

  // We aren't querying anything yet—just verifying the client initializes
  const { data, error } = await supabase.auth.getSession();

  return NextResponse.json({
    ok: !error,
    error: error?.message ?? null,
    hasSession: !!data.session,
  });
}