

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/core/storage/supabaseClient";
import { upsertUsername } from "@/core/storage/backendSync";

export default function UsernameOnboardingPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    const clean = username.trim().toLowerCase();

    if (!clean) {
      setError("Please enter a username.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      if (!user) {
        setError("You must be signed in.");
        return;
      }

      const res = await upsertUsername(user.id, clean);

      if (!res.ok) {
        setError(res.error ?? "Failed to save username.");
        return;
      }

      router.replace("/log");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[0.03] p-6 space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Choose a username</h1>
          <p className="text-sm text-white/60">
            This is how friends will find you.
          </p>
        </div>

        <label className="block text-sm text-white/70">
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. ryan"
            className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
          />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        ) : null}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full rounded-xl bg-white text-black font-medium px-4 py-3 disabled:opacity-60"
        >
          {isSaving ? "Saving…" : "Continue"}
        </button>
      </div>
    </main>
  );
}