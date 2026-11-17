"use client";
import { mhref } from "@/lib/client/href";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorkspaceProvider, useWS } from "@/components/ws/context";
import { cx, ErrorBox, Progress } from "@/components/ui";
import { StatusPill } from "@/components/ManuscriptCard";

const TABS = [
  ["", "Overview"],
  ["/report", "Report"],
  ["/chapters", "Chapters"],
  ["/editor", "Revision Workspace"],
  ["/issues", "All Findings"],
  ["/intelligence", "Story Intelligence"],
  ["/bible", "Story Bible"],
  ["/companion", "Creative Companion"],
  ["/branches", "Story Branches"],
  ["/publication", "Publication"],
  ["/exports", "Exports"],
  ["/history", "History"],
];

function Header() {
  const { id, data, error } = useWS();
  const path = usePathname();
  const base = mhref(id);
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  const ms = data?.manuscript;
  const job = data?.job;
  const running = job && ["queued", "running"].includes(job.status);
  return (
    <div className="sticky top-0 z-20 border-b border-navy-100 bg-white/95 backdrop-blur lg:top-0">
      <div className="mx-auto max-w-7xl px-5 pt-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/app/manuscripts" className="text-xs text-navy-400 hover:text-navy-700">My Manuscripts /</Link>
          <h1 className="h-display truncate text-2xl">{ms?.title ?? "…"}</h1>
          {ms && <StatusPill status={ms.status} />}
          {ms && <span className="text-xs text-navy-400">{ms.word_count.toLocaleString()} words</span>}
        </div>
        {running && (
          <Link href={base} className="mt-2 flex items-center gap-3 text-xs text-navy-600">
            <span className="w-48"><Progress value={job.progress} /></span>
            <span className="truncate">{job.message}</span>
          </Link>
        )}
        <nav className="scrollbar-thin -mx-1 mt-2 flex overflow-x-auto">
          {TABS.map(([h, l]) => {
            const href = mhref(id, h);
            const sub = path.replace(/^\/app\/m\/[^/]+/, "").replace(/\/$/, "");
            const active = h === "" ? sub === "" : sub.startsWith(h);
            return <Link key={h} href={href} className={cx("tab", active && "tab-active")}>{l}</Link>;
          })}
        </nav>
      </div>
    </div>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  const sp = useSearchParams();
  const id = params.id === "_" ? sp.get("ms") ?? "" : params.id;
  if (!id) return null;
  return (
    <WorkspaceProvider id={id}>
      <Header />
      <div className="mx-auto max-w-7xl p-5 sm:p-8">{children}</div>
    </WorkspaceProvider>
  );
}

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}
