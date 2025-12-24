"use client";
import "./globals.css";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
  icon: React.ReactNode;
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
      <span className={active ? "text-[11px] font-semibold text-white" : "text-[11px] font-medium text-white/60"}>
        {label}
      </span>
    </Link>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || (href !== "/" && pathname?.startsWith(href + "/"));

  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        {/* Desktop / top nav */}
        <header className="hidden md:block border-b border-white/10">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/log" className="text-lg font-semibold">
              BingeBuddy
            </Link>

            <nav className="flex flex-wrap gap-1">
              <DesktopNavLink href="/log" label="Log" active={isActive("/log")} />
              <DesktopNavLink href="/my-list" label="My List" active={isActive("/my-list")} />
              <DesktopNavLink href="/profile" label="Profile" active={isActive("/profile")} />
            </nav>
          </div>
        </header>

        {/* Content (extra bottom padding on mobile for bottom nav) */}
        <main className="mx-auto w-full max-w-3xl px-4 py-6 pb-24 md:pb-6">
          {children}
        </main>

        {/* Mobile / bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/90 backdrop-blur">
          <div className="mx-auto w-full max-w-3xl px-4 py-3 grid grid-cols-3 gap-2">
            <MobileNavItem
              href="/log"
              label="Log"
              active={isActive("/log")}
              icon={<IconLog active={isActive("/log")} />}
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
      </body>
    </html>
  );
}