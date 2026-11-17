import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

const pillars = [
  { t: "Understand your book", d: "Summaries, character profiles, relationship maps, conflicts, plot structure, themes — and a living Story Bible built from every chapter." },
  { t: "Improve your book", d: "Developmental, line and copy editing plus proofreading. Every finding quotes your exact words, explains why, and suggests a fix you can accept, reject or modify." },
  { t: "Help you write it", d: "“Help Me Continue”, What-If explorations and an “I'm Stuck” partner that know your characters and check every idea for continuity." },
  { t: "Plan what comes next", d: "A Future Chapter Planner, long-term story planning and experimental story branches kept safely apart from your manuscript." },
];

export default async function Home() {
  if (await currentUser()) redirect("/app");
  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo light />
        <div className="flex gap-2">
          <Link href="/login" className="btn text-navy-100 hover:text-white">Sign in</Link>
          <Link href="/register" className="btn-gold">Create free account</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-12">
        <div className="max-w-3xl">
          <div className="eyebrow mb-4 text-gold-300">Professional editorial software for authors</div>
          <h1 className="font-serif text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            A full editorial team for your manuscript — <span className="text-gold-300">without the invoice.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-navy-200">
            Upload a 60,000, 100,000 or 150,000-word manuscript. Cashless Edit reads it chapter by chapter, remembers everything it learns, and delivers a developmental edit, line edit, copy edit, proofread, continuity check and publication audit — grounded in your actual text.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn-gold px-6 py-3 text-base">Start editing — free</Link>
            <Link href="/login" className="btn border border-navy-600 px-6 py-3 text-base text-white hover:bg-navy-900">I have an account</Link>
          </div>
          <p className="mt-4 text-sm text-navy-300">Runs on free, unlimited local AI (Ollama) or free-tier APIs. No subscriptions. Your manuscripts stay private.</p>
        </div>
        <div className="mt-20 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div key={p.t} className="rounded-xl border border-navy-800 bg-navy-900/60 p-5">
              <div className="mb-3 h-px w-8 bg-gold-400" />
              <h3 className="font-serif text-xl font-semibold">{p.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-navy-300">{p.d}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 rounded-xl border border-navy-800 p-6 text-sm leading-relaxed text-navy-300">
          <strong className="text-white">Honest by design.</strong> Cashless Edit never invents quotations — AI findings whose quoted text can't be found in your manuscript are discarded automatically. Objective errors are separated from subjective recommendations. Scores are never inflated, and nothing in your manuscript changes unless you accept it.
        </div>
      </main>
    </div>
  );
}
