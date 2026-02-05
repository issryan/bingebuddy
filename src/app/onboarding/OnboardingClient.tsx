"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Keep the types local so Supabase calls don't infer `never`.
// (We haven't generated DB types yet.)
type ProfileRow = {
    user_id: string;
    username?: string | null;
    display_name?: string | null;
    has_completed_onboarding?: boolean | null;
};

function normalizeUsername(input: string) {
    return input.trim().toLowerCase();
}

function isValidUsername(u: string) {
    // 3–20 chars, letters/numbers/underscore only
    return /^[a-z0-9_]{3,20}$/.test(u);
}

export default function OnboardingClient() {
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");

    const [error, setError] = useState<string | null>(null);

    const normalized = useMemo(() => normalizeUsername(username), [username]);
    const usernameOk = isValidUsername(normalized);

    useEffect(() => {
        async function boot() {
            setLoading(true);
            setError(null);

            const { data: sess } = await supabase.auth.getSession();
            const user = sess.session?.user ?? null;

            if (!user) {
                router.replace("/login");
                return;
            }

            // Ensure profile exists
            await supabase.from("profiles").upsert({ user_id: user.id }, { onConflict: "user_id" });

            // Load profile (support optional `has_completed_onboarding` if the column exists)
            let profile: ProfileRow | null = null;

            // Try selecting the onboarding flag; if the column doesn't exist yet, fall back.
            const { data: p1, error: e1 } = await supabase
                .from("profiles")
                .select("user_id, username, display_name, has_completed_onboarding")
                .eq("user_id", user.id)
                .maybeSingle();

            if (e1) {
                const { data: p2 } = await supabase
                    .from("profiles")
                    .select("user_id, username, display_name")
                    .eq("user_id", user.id)
                    .maybeSingle();

                profile = (p2 as ProfileRow | null) ?? null;
            } else {
                profile = (p1 as ProfileRow | null) ?? null;
            }

            const existingUsername = (profile?.username ?? "").trim();
            const hasOnboardedFlag = profile?.has_completed_onboarding === true;

            // Treat default placeholder usernames like `user_<id>` as NOT onboarded.
            const isPlaceholderUsername = /^user_[a-z0-9]+$/i.test(existingUsername);

            if (hasOnboardedFlag || (existingUsername && !isPlaceholderUsername)) {
                router.push("/log");
                return;
            }

            // Pre-fill optional fields if present
            if (typeof profile?.display_name === "string") setDisplayName(profile.display_name);

            setLoading(false);
        }

        void boot();
    }, [router]);

    async function save() {
        setError(null);

        const u = normalizeUsername(username);
        if (!u) {
            setError("Pick a username.");
            return;
        }
        if (!isValidUsername(u)) {
            setError("Username must be 3–20 characters and only use letters, numbers, and underscores.");
            return;
        }

        const { data: sess } = await supabase.auth.getSession();
        const user = sess.session?.user ?? null;
        if (!user) {
            setError("You’re not signed in. Please sign in again.");
            return;
        }

        setSaving(true);

        // Check uniqueness
        const { data: existing } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("username", u)
            .maybeSingle();

        if (existing?.user_id && existing.user_id !== user.id) {
            setSaving(false);
            setError("That username is taken. Try another.");
            return;
        }

        // Save profile fields (keep it minimal for now)
        // Also try to set `has_completed_onboarding` if the column exists.
        const updatePayload: Record<string, unknown> = {
            username: u,
            display_name: displayName.trim() || null,
            has_completed_onboarding: true,
        };

        let upsertError: { message?: string } | null = null;

        const { error: e1 } = await supabase
            .from("profiles")
            .update(updatePayload)
            .eq("user_id", user.id);

        if (e1) {
            // If the column doesn't exist yet, retry without it.
            const { error: e2 } = await supabase
                .from("profiles")
                .update({
                    username: u,
                    display_name: displayName.trim() || null,
                } as Record<string, unknown>)
                .eq("user_id", user.id);

            upsertError = e2 ?? e1;
        }

        setSaving(false);

        if (upsertError) {
            setError(upsertError.message || "Couldn’t save your profile. Try again.");
            return;
        }

        router.push("/log");
    }

    if (loading) {
        return (
            <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 text-white/70">
                Loading…
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-4">
            <label className="block text-sm text-white/70">
                Username
                <input
                    value={username}
                    onChange={(e) => {
                        setUsername(e.target.value);
                        if (error) setError(null);
                    }}
                    placeholder="e.g. ryan_123"
                    className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
                />
                <div className="mt-2 text-xs text-white/50">
                    3–20 characters. Letters, numbers, underscores.
                </div>
            </label>

            <label className="block text-sm text-white/70">
                Name (optional)
                <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ryan"
                    className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
                />
            </label>

            {error ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
                    {error}
                </div>
            ) : null}

            <button
                type="button"
                onClick={save}
                disabled={saving || !usernameOk}
                className="w-full rounded-xl bg-white text-black font-medium px-4 py-3 disabled:opacity-60"
            >
                {saving ? "Saving…" : "Continue"}
            </button>
        </div>
    );
}