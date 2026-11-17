"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "./Logo";
import { cx } from "./ui";
import { api } from "@/lib/client/api";

const NAV = [
  { href: "/app", label: "Dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/app/new", label: "New Manuscript", icon: "M12 5v14M5 12h14" },
  { href: "/app/manuscripts", label: "My Manuscripts", icon: "M6 4h9l3 3v13H6zM9 9h6M9 13h6M9 17h4" },
  { href: "/app/reports", label: "Editing Reports", icon: "M5 20V10M10 20V4M15 20v-7M20 20v-4" },
  { href: "/app/publication", label: "Publication Readiness", icon: "M5 4h10a4 4 0 014 4v12H9a4 4 0 01-4-4zM9 8h6" },
  { href: "/app/revisions", label: "Saved Revisions", icon: "M12 8v4l3 2M4 12a8 8 0 108-8 8 8 0 00-7 4M4 4v4h4" },
  { href: "/app/exports", label: "Exported Documents", icon: "M12 4v11M7 10l5 5 5-5M5 20h14" },
  { href: "/app/settings", label: "Account Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export function Shell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const active = (h: string) => (h === "/app" ? path === "/app" : path.startsWith(h));
  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cx("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition", active(n.href) ? "bg-navy-800 text-white" : "text-navy-300 hover:bg-navy-900 hover:text-white")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={active(n.href) ? "text-gold-300" : ""}>
            <path d={n.icon} />
          </svg>
          {n.label}
        </Link>
      ))}
    </nav>
  );
  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 flex-none flex-col bg-navy-950 py-5 lg:flex">
        <Link href="/app" className="mb-8 px-6">
          <Logo light />
        </Link>
        {nav}
        <div className="mx-3 mt-4 border-t border-navy-800 px-3 pt-4">
          <div className="truncate text-sm text-white">{user.name}</div>
          <div className="truncate text-xs text-navy-400">{user.email}</div>
          <button onClick={logout} className="mt-2 text-xs text-gold-300 hover:text-gold-200">Sign out</button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between bg-navy-950 px-4 py-3 lg:hidden">
          <Logo light />
          <button className="text-white" onClick={() => setOpen(!open)} aria-label="Menu">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-40 bg-navy-950/95 pt-16 lg:hidden" onClick={() => setOpen(false)}>
            {nav}
            <button onClick={logout} className="ml-6 mt-6 text-sm text-gold-300">Sign out</button>
          </div>
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
