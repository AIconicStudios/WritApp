"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "./Logo";
import { Spinner } from "./ui";

/** Android app start screen: boots the on-device engine, then opens the dashboard. */
export function MobileStart() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MOBILE !== "1") return; // removed from the web bundle at compile time
    import("@/mobile/boot")
      .then((m) => m.ready())
      .then(() => router.replace("/app/"))
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [router]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy-950 p-8 text-center text-white">
      <Logo light />
      {err ? <p className="text-sm text-red-300">Could not start: {err}</p> : <p className="flex items-center gap-2 text-sm text-navy-300"><Spinner /> Opening your library…</p>}
      <p className="max-w-xs text-xs text-navy-400">Everything runs on this phone. Your manuscripts never leave it unless you connect an online AI service.</p>
    </div>
  );
}
