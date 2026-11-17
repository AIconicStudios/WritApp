"use client";
import { cx } from "./ui";
import { MODES, type EditMode } from "@/lib/types";

export function ModePicker({ value, onChange, aiEnabled }: { value: EditMode; onChange: (m: EditMode) => void; aiEnabled: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {MODES.map((m, i) => (
        <button type="button" key={m.id} onClick={() => onChange(m.id)} className={cx("rounded-lg border p-4 text-left transition", value === m.id ? "border-gold-400 bg-gold-50/60 ring-2 ring-gold-200" : "border-navy-100 bg-white hover:border-navy-300")}>
          <div className="flex items-center justify-between">
            <span className="font-serif text-lg font-semibold text-navy-950">{i + 1}. {m.name}</span>
            {m.id === "full" && <span className="chip border-gold-300 bg-gold-100 text-gold-700">Recommended</span>}
          </div>
          <p className="mt-1 text-sm text-navy-600">{m.blurb}</p>
          <p className="mt-2 text-[11px] text-navy-400">
            {m.needsAI === "no" ? "Fully available offline (built-in engine)" : m.needsAI === "partial" ? (aiEnabled ? "Built-in rules + AI reading" : "Built-in rules now; AI adds deeper edits") : aiEnabled ? "Uses your AI model" : "Needs an AI model for the story analysis"}
          </p>
        </button>
      ))}
    </div>
  );
}
