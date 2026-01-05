"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

export default function AuthClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshSession() {
    const { data } = await supabase.auth.getSession();
    setSessionEmail(data.session?.user.email ?? null);
  }

  useEffect(() => {
    refreshSession();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refreshSession();
      router.refresh();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function signUp() {
    setMessage(null);
    if (!email.trim() || !password.trim()) {
      setMessage("Enter email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Account created. You’re signed in.");
    setEmail("");
    setPassword("");
  }

  async function signIn() {
    setMessage(null);
    if (!email.trim() || !password.trim()) {
      setMessage("Enter email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Signed in.");
    setEmail("");
    setPassword("");
  }

  async function signOut() {
    setMessage(null);
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Signed out.");
  }

  return (
    <div className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 space-y-4">
      {sessionEmail ? (
        <>
          <div className="text-sm text-white/70">Signed in as</div>
          <div className="text-lg font-semibold">{sessionEmail}</div>

          <button
            onClick={signOut}
            disabled={loading}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 font-medium disabled:opacity-60"
          >
            {loading ? "Signing out..." : "Sign out"}
          </button>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <label className="block text-sm text-white/70">
              Email
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
              />
            </label>

            <label className="block text-sm text-white/70">
              Password
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type="password"
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/30"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={signUp}
              disabled={loading}
              className="rounded-xl bg-white text-black font-medium px-4 py-3 disabled:opacity-60"
            >
              Sign up
            </button>

            <button
              onClick={signIn}
              disabled={loading}
              className="rounded-xl bg-white/10 border border-white/15 font-medium px-4 py-3 disabled:opacity-60"
            >
              Sign in
            </button>
          </div>
        </>
      )}

      {message ? <div className="text-sm text-white/70">{message}</div> : null}

      <div className="text-xs text-white/40">
        This is only for syncing your data. No social features yet.
      </div>
    </div>
  );
}