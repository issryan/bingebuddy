"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AuthClient() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

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

  async function ensureProfileAndRoute() {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) return;

    // Ensure a profiles row exists for this user.
    await supabase.from("profiles").upsert({ user_id: user.id }, { onConflict: "user_id" });

    // Check if username exists and is not a placeholder.
    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("user_id", user.id)
      .maybeSingle();

    const username = (profile?.username ?? "").trim();
    const isPlaceholder = /^user_[a-z0-9]+$/i.test(username);

    if (!username || isPlaceholder) {
      router.push("/onboarding");
    } else {
      router.push("/home");
    }
  }

  async function signUp() {
    setMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setMessage("Enter email and password.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
    });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setEmail("");
    setPassword("");

    // If email confirmation is required, there may be no session yet.
    if (!data.session) {
      setMessage("Account created. Check your email to confirm, then sign in.");
      return;
    }

    setMessage("Account created. Finishing setup…");
    await ensureProfileAndRoute();
  }

  async function signIn() {
    setMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setMessage("Enter email and password.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Signed in. Finishing setup…");
    setEmail("");
    setPassword("");

    await ensureProfileAndRoute();
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
    router.push("/login");
  }

  return (
    <div className="mx-auto w-full max-w-md px-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-sm">
        <div className="space-y-1">
          <div className="text-xs font-semibold tracking-wider text-white/60">BingeBuddy</div>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to sync your lists</h1>
          <p className="text-sm text-white/60">
            Keep your rankings, want-to-watch, and friends feed consistent across devices.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          {sessionEmail ? (
            <>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="text-xs text-white/60">Signed in as</div>
                <div className="mt-1 text-sm font-medium text-white break-all">{sessionEmail}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button asChild className="w-full">
                  <Link href="/home">Go to Home</Link>
                </Button>

                <Button
                  type="button"
                  onClick={signOut}
                  disabled={loading}
                  variant="secondary"
                  className="w-full"
                >
                  {loading ? "Signing out…" : "Sign out"}
                </Button>
              </div>

              <p className="text-xs text-white/50">You’re all set. Go binge something.</p>
            </>
          ) : (
            <>
              <Tabs value={mode} onValueChange={(v) => setMode(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>

                <div className="mt-4 space-y-3">
                  <label className="block text-sm text-white/70">
                    Email
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      className="mt-2"
                    />
                  </label>

                  <label className="block text-sm text-white/70">
                    Password
                    <Input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      className="mt-2"
                    />
                  </label>
                </div>

                <TabsContent value="signin" className="mt-4">
                  <Button type="button" onClick={signIn} disabled={loading} className="w-full">
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                  <p className="mt-3 text-xs text-white/50">
                    New here? Switch to <span className="text-white/70">Sign up</span>.
                  </p>
                </TabsContent>

                <TabsContent value="signup" className="mt-4">
                  <Button type="button" onClick={signUp} disabled={loading} className="w-full">
                    {loading ? "Creating…" : "Create account"}
                  </Button>
                  <p className="mt-3 text-xs text-white/50">
                    You may need to confirm your email before your first sign in.
                  </p>
                </TabsContent>
              </Tabs>
            </>
          )}

          {message ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/80"
            >
              {message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}