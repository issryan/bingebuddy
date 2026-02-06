import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import UserFriendActions from "@/app/components/user/UserFriendActions";

type PageProps = {
  params: Promise<{ username: string }>;
};

export default async function UserProfilePage({ params }: PageProps) {
  const { username: rawUsername } = await params;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const username = decodeURIComponent(rawUsername).trim().toLowerCase();

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .eq("username", username)
    .maybeSingle();

  if (!profile) notFound();

  const [{ count: rankedCount }, { count: wantToWatchCount }] = await Promise.all([
    supabase
      .from("ranked_shows")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.user_id),
    supabase
      .from("want_to_watch")
      .select("*", { count: "exact", head: true })
      .eq("user_id", profile.user_id),
  ]);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">@{profile.username}</h1>
          {profile.display_name ? (
            <div className="text-white/70">{profile.display_name}</div>
          ) : null}
        </div>

        <div className="flex gap-6 text-sm text-white/70">
          <div>
            <span className="font-medium text-white">{rankedCount ?? 0}</span> ranked
          </div>
          <div>
            <span className="font-medium text-white">{wantToWatchCount ?? 0}</span> want to watch
          </div>
        </div>

        <div className="pt-2">
          <UserFriendActions targetUserId={profile.user_id} targetUsername={profile.username} />
        </div>
      </div>
    </div>
  );
}