// src/app/layout.tsx
import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "BingeBuddy",
  description: "Personal show ranking app",
};

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
    >
      {label}
    </Link>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/log" className="text-lg font-semibold">
              BingeBuddy
            </Link>

            <nav className="flex flex-wrap gap-1">
              <NavLink href="/log" label="Log" />
              <NavLink href="/my-list" label="My List" />
              <NavLink href="/profile" label="Profile" />
            </nav>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}