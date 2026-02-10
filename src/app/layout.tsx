"use client";

import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { setActiveUserId } from "@/core/storage/scope";
import { getRankedShows, getState } from "@/core/logic/state";
import { safeGetWantToWatch } from "@/core/storage/wantToWatchStorage";
import { saveToBackend } from "@/core/storage/backendSync";

function IconLog({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={active ? "text-white" : "text-white/50"}
    >
      <path
        d="M8 6h13M8 12h13M8 18h13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconList({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={active ? "text-white" : "text-white/50"}
    >
      <path
        d="M7 7h14M7 12h14M7 17h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3 7h.01M3 12h.01M3 17h.01"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconProfile({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={active ? "text-white" : "text-white/50"}
    >
      <path
        d="M20 21a8 8 0 10-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 11a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type SearchMode = "all" | "shows" | "users";
type SearchShowResult = {
  kind: "show";
  tmdbId: number;
  title: string;
  year: string | null;
  posterPath: string | null;
};
type SearchUserResult = { kind: "user"; username: string };
type SearchResult = SearchShowResult | SearchUserResult;

function ratingBadgeClass(rating: number): string {
  if (rating >= 7) return "border-green-400/40 text-green-300";
  if (rating >= 4) return "border-yellow-400/40 text-yellow-300";
  return "border-red-400/40 text-red-300";
}

function GlobalSearchBar({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<SearchMode>("all");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

  const rankedByTmdbId = useMemo(() => {
    try {
      const ranked = getRankedShows(getState()) as any[];
      const m = new Map<number, number>();
      for (const s of ranked ?? []) {
        const tmdbId = typeof s?.tmdbId === "number" ? s.tmdbId : Number(s?.tmdbId);
        if (!Number.isFinite(tmdbId)) continue;

        // Some parts of the app store rating, others derive it — try both.
        const rawRating = s?.derivedRating ?? s?.rating;
        const rating = typeof rawRating === "number" ? rawRating : Number(rawRating);
        if (Number.isFinite(rating)) m.set(tmdbId, rating);
      }
      return m;
    } catch {
      return new Map<number, number>();
    }
  }, [open]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target))
        setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const clean = q.trim();
    if (clean.length < 2) {
      setResults([]);
      return;
    }

    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      const next: SearchResult[] = [];

      if (mode !== "users") {
        try {
          const r = await fetch(`/api/tmdb/search?query=${encodeURIComponent(clean)}`);
          if (r.ok) {
            const j = await r.json();
            (j.results ?? [])
              .slice(0, 5)
              .forEach((s: any) => {
                if (Number.isFinite(s.tmdbId))
                  next.push({
                    kind: "show",
                    tmdbId: s.tmdbId,
                    title: s.title,
                    year: s.year ?? null,
                    posterPath: s.posterPath ?? null,
                  });
              });
          }
        } catch { }
      }

      if (mode !== "shows") {
        try {
          const r = await fetch(`/api/users/search?query=${encodeURIComponent(clean)}`);
          if (r.ok) {
            const j = await r.json();
            (j.results ?? [])
              .slice(0, 5)
              .forEach((u: any) => next.push({ kind: "user", username: u.username }));
          }
        } catch { }
      }

      if (!alive) return;
      setResults(next);
      setLoading(false);
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, mode, open]);


  function goFull() {
    const clean = q.trim();
    if (!clean) return;
    router.push(`/search?q=${encodeURIComponent(clean)}&type=${mode}`);
    setOpen(false);
  }

  function pick(r: SearchResult) {
    setOpen(false);
    if (r.kind === "show") router.push(`/show/${r.tmdbId}`);
    else router.push(`/u/${encodeURIComponent(r.username)}`);
  }

  async function quickWant(show: SearchShowResult) {
    // Close dropdown immediately for snappy UI
    setOpen(false);

    // If it’s already ranked, just take them to the show
    if (rankedByTmdbId.has(show.tmdbId)) {
      router.push(`/show/${show.tmdbId}`);
      return;
    }

    try {
      // Must be signed in to persist
      const sessionRes = await supabase.auth.getSession();
      const user = sessionRes.data.session?.user ?? null;
      if (!user) {
        router.push("/login");
        return;
      }

      // 1) Upsert minimal show metadata so list pages can render
      const upsertShow = await supabase
        .from("shows")
        .upsert(
          {
            user_id: user.id,
            tmdb_id: show.tmdbId,
            title: show.title,
            poster_path: show.posterPath ?? null,
            year: show.year ?? null,
            genres: [],
            overview: "",
          },
          { onConflict: "user_id,tmdb_id" }
        );

      if (upsertShow.error) {
        // Fall back to My List so the user isn’t stuck
        try {
          window.dispatchEvent(new Event("bingebuddy:state-changed"));
        } catch {
          // ignore
        }
        router.push("/my-list?tab=watch");
        router.refresh();
        return;
      }

      // 2) Upsert into want_to_watch (requires a unique constraint on user_id,tmdb_id)
      const upsertWtw = await supabase
        .from("want_to_watch")
        .upsert(
          {
            user_id: user.id,
            tmdb_id: show.tmdbId,
          },
          { onConflict: "user_id,tmdb_id" }
        );

      if (upsertWtw.error) {
        try {
          window.dispatchEvent(new Event("bingebuddy:state-changed"));
        } catch {
          // ignore
        }
        router.push("/my-list?tab=watch");
        router.refresh();
        return;
      }

      // Tell any pages (My List, etc.) to re-hydrate immediately
      try {
        window.dispatchEvent(new Event("bingebuddy:state-changed"));
      } catch {
        // ignore
      }

      // Go to My List with Want tab open
      router.push("/my-list?tab=watch");

      // Ensure the destination page re-runs its data fetch
      router.refresh();
    } catch {
      try {
        window.dispatchEvent(new Event("bingebuddy:state-changed"));
      } catch {
        // ignore
      }
      router.push("/my-list?tab=watch");
      router.refresh();
    }
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") goFull();
          }}
          placeholder="Search shows or friends"
          className="flex-1 rounded-2xl bg-white/5 border border-white/10 px-4 py-3"
        />
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as SearchMode)}
          className="rounded-2xl bg-white/5 border border-white/10 px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="shows">Shows</option>
          <option value="users">Users</option>
        </select>
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-2xl border border-white/15 bg-black/95">
          <div className="px-4 py-2 text-xs text-white/60">
            {loading ? "Searching…" : "Top results"}
          </div>
          {results.map((r, i) => {
            if (r.kind === "user") {
              return (
                <button
                  key={i}
                  onClick={() => pick(r)}
                  className="w-full text-left px-4 py-3 hover:bg-white/10"
                >
                  @{r.username}
                </button>
              );
            }

            const rating = rankedByTmdbId.get(r.tmdbId);

            return (
              <div
                key={i}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/10"
              >
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="truncate">
                    {r.title}
                    {r.year ? ` (${r.year})` : ""}
                  </div>
                </button>

                {typeof rating === "number" ? (
                  <div
                    className={
                      "shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full border bg-white/5 text-xs font-semibold " +
                      ratingBadgeClass(rating)
                    }
                    title={`Rated ${rating.toFixed(1)}`}
                    aria-label={`Rated ${rating.toFixed(1)}`}
                  >
                    {rating.toFixed(1)}
                  </div>
                ) : (
                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpen(false);
                        router.push(`/rank?tmdbId=${r.tmdbId}&auto=1`);
                      }}
                      className="w-10 h-10 rounded-full bg-white text-black font-semibold flex items-center justify-center hover:opacity-90"
                      aria-label={`Quick rank ${r.title}`}
                      title="Rank"
                    >
                      +
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        quickWant(r);
                      }}
                      className="w-10 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/80 hover:bg-white/15"
                      aria-label={`Add ${r.title} to Want to Watch`}
                      title="Want to Watch"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="opacity-90"
                      >
                        <path
                          d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {q.trim() && (
            <button
              onClick={goFull}
              className="w-full px-4 py-2 text-sm text-white/70 hover:bg-white/10"
            >
              See all results →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DesktopNavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white"
          : "rounded-xl px-3 py-2 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white"
      }
    >
      {label}
    </Link>
  );
}

function MobileNavItem({
  href,
  label,
  active,
  icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/10 px-2 py-2"
          : "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 hover:bg-white/10"
      }
    >
      {icon}
      <span
        className={
          active
            ? "text-[11px] font-semibold text-white"
            : "text-[11px] font-medium text-white/60"
        }
      >
        {label}
      </span>
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));

  const isLoginPage = pathname === "/login";
  const isOnboardingPage = pathname === "/onboarding";

  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      const userId = data.session?.user?.id ?? null;
      const has = !!userId;

      // scope localStorage to the signed-in user (or guest when signed out)
      setActiveUserId(userId);

      setIsAuthed(has);
      setAuthChecked(true);

      // Not authed: only allow /login
      if (!has) {
        if (!isLoginPage) router.replace("/login");
        return;
      }

      // Authed: check username
      let hasUsername = false;
      try {
        const prof = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", userId)
          .maybeSingle();

        const uname = (prof.data?.username ?? "").trim();
        const isPlaceholder = /^user_[a-z0-9]+$/i.test(uname);
        hasUsername = !!uname && !isPlaceholder;
      } catch {
        hasUsername = false;
      }

      // If missing username, force /onboarding (but don't loop)
      if (!hasUsername) {
        if (!isOnboardingPage) router.replace("/onboarding");
        return;
      }

      // If they DO have username, keep them out of onboarding/login
      if (isOnboardingPage || isLoginPage) {
        router.replace("/home");
        return;
      }
    }

    void check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void check();
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router, isLoginPage, isOnboardingPage]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        {isLoginPage || isOnboardingPage ? (
          <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
        ) : !authChecked ? (
          <main className="min-h-screen flex items-center justify-center px-6">
            <div className="text-sm text-white/60">Loading…</div>
          </main>
        ) : !isAuthed ? (
          <main className="min-h-screen flex items-center justify-center px-6">
            <div className="text-sm text-white/60">Redirecting…</div>
          </main>
        ) : (
          <>
            {/* Desktop / top nav */}
            <header className="hidden md:block border-b border-white/10">
              <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link href="/home" className="text-lg font-semibold">                  BingeBuddy
                </Link>
                <div className="hidden md:block w-[360px]">
                  <GlobalSearchBar />
                </div>
                <nav className="flex flex-wrap gap-1">
                  <DesktopNavLink href="/home" label="Home" active={isActive("/home")} />
                  <DesktopNavLink href="/my-list" label="My List" active={isActive("/my-list")} />
                  <DesktopNavLink href="/profile" label="Profile" active={isActive("/profile")} />
                </nav>
              </div>
            </header>

            {/* Content */}
            <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 md:pb-6">
              <div className="md:hidden mb-5">
                <GlobalSearchBar />
              </div>
              {children}
            </main>

            {/* Mobile / bottom nav */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/90 backdrop-blur">
              <div className="mx-auto w-full max-w-3xl px-4 py-3 grid grid-cols-3 gap-2">
                <MobileNavItem
                  href="/home"
                  label="Home"
                  active={isActive("/home")}
                  icon={<IconLog active={isActive("/home")} />}
                />
                <MobileNavItem
                  href="/my-list"
                  label="My List"
                  active={isActive("/my-list")}
                  icon={<IconList active={isActive("/my-list")} />}
                />
                <MobileNavItem
                  href="/profile"
                  label="Profile"
                  active={isActive("/profile")}
                  icon={<IconProfile active={isActive("/profile")} />}
                />
              </div>
            </nav>
          </>
        )}
      </body>
    </html>
  );
}