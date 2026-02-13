"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [usernameStatus, setUsernameStatus] = useState<
      "idle" | "invalid" | "checking" | "available" | "taken"
    >("idle");

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

            setCurrentUserId(user.id);

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

    useEffect(() => {
      // Live availability check (debounced)
      if (!normalized) {
        setUsernameStatus("idle");
        return;
      }

      if (!usernameOk) {
        setUsernameStatus("invalid");
        return;
      }

      if (!currentUserId) {
        // We can't reliably check ownership until we know who is signed in.
        setUsernameStatus("checking");
        return;
      }

      const controller = new AbortController();
      const t = setTimeout(async () => {
        try {
          setUsernameStatus("checking");

          const { data, error } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("username", normalized)
            .maybeSingle();

          if (error) {
            // Don't hard-fail the UI; keep it neutral.
            setUsernameStatus("available");
            return;
          }

          if (data?.user_id && String(data.user_id) !== currentUserId) {
            setUsernameStatus("taken");
          } else {
            setUsernameStatus("available");
          }
        } catch {
          // If the request was aborted or anything else, do nothing noisy.
        }
      }, 350);

      return () => {
        clearTimeout(t);
        controller.abort();
      };
    }, [normalized, usernameOk, currentUserId]);

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
        if (usernameStatus === "taken") {
            setError("That username is taken. Try another.");
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
        <div className="mx-auto w-full max-w-lg">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="h-5 w-40 rounded bg-white/10" />
            <div className="mt-3 h-4 w-72 rounded bg-white/10" />
            <div className="mt-6 space-y-3">
              <div className="h-10 w-full rounded bg-white/10" />
              <div className="h-10 w-full rounded bg-white/10" />
              <div className="h-10 w-full rounded bg-white/10" />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Finish setup</h1>
            <p className="text-sm text-white/60">Pick a username so friends can find you.</p>
          </div>

          <div className="mt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Username</label>
              <Input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. issryan"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-11"
              />

              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-white/50">3–20 chars · letters, numbers, _</span>

                <span
                  className={
                    username.length === 0
                      ? "text-white/40"
                      : usernameStatus === "available"
                      ? "text-emerald-300/90"
                      : usernameStatus === "taken"
                      ? "text-red-300/90"
                      : usernameStatus === "invalid"
                      ? "text-amber-300/90"
                      : "text-white/60"
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    {username.length === 0 ? "@preview" : `@${normalized}`}

                    {username.length > 0 && usernameStatus === "available" ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className="h-4 w-4"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.293a1 1 0 010 1.414l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}

                    {username.length > 0 && usernameStatus === "taken" ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className="h-4 w-4"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm2.707-10.707a1 1 0 00-1.414-1.414L10 7.172 8.707 5.879a1 1 0 00-1.414 1.414L8.586 8.586l-1.293 1.293a1 1 0 101.414 1.414L10 10l1.293 1.293a1 1 0 001.414-1.414L11.414 8.586l1.293-1.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}

                    {username.length > 0 && usernameStatus === "checking" ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : null}
                  </span>
                </span>
              </div>

              {username.length > 0 && usernameStatus === "invalid" ? (
                <div className="text-xs text-amber-300/90">
                  Keep it lowercase and use only letters, numbers, or underscores.
                </div>
              ) : null}

              {username.length > 0 && usernameStatus === "taken" ? (
                <div className="text-xs text-red-300/90">Username is already taken.</div>
              ) : null}

              {username.length > 0 && usernameStatus === "available" ? (
                <div className="text-xs text-emerald-300/90">Username is available.</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">Name (optional)</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ryan"
                className="h-11"
              />
              <div className="text-xs text-white/50">This can be changed later.</div>
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col gap-3">
              <Button
                type="button"
                onClick={save}
                disabled={saving || !usernameOk || usernameStatus !== "available"}
                className="h-11"
              >
                {saving ? "Saving…" : "Continue"}
              </Button>

              <div className="text-xs text-white/45">
                Usernames are lowercase for now.
              </div>
            </div>
          </div>
        </div>
      </div>
    );
}