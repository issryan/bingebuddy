import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import UserFriendActions from "../../components/user/UserFriendActions";

type PageProps = {
    params: { username: string };
};

export default async function UserProfilePage({ params }: PageProps) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const username = params.username;

    // Load profile by username
    const { data: profile, error } = await supabase
        .from("profiles")
        .select("user_id, username")
        .eq("username", username)
        .single();

    if (error || !profile) {
        notFound();
    }

    // Basic stats
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
            <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-2">
                <h1 className="text-2xl font-semibold">@{profile.username}</h1>
                <div className="flex gap-6 text-sm text-white/70">
                    <div>
                        <span className="font-medium text-white">{rankedCount ?? 0}</span>{" "}
                        ranked
                    </div>
                    <div>
                        <span className="font-medium text-white">{wantToWatchCount ?? 0}</span>{" "}
                        want to watch
                    </div>
                </div>

                <div className="pt-4">
                    <UserFriendActions targetUserId={profile.user_id} targetUsername={profile.username} />
                </div>
            </div>
        </div>
    );
}