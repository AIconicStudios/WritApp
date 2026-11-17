"use client";
import { useMemo, useState } from "react";

export const REL_COLORS: Record<string, string> = {
  family: "#2f7a4a", romantic: "#be185d", friendship: "#2563eb", rivalry: "#c2410c", enemy: "#b91c1c", professional: "#64748b", alliance: "#0d9488", betrayal: "#7c2d12", conflict: "#b45309", other: "#94a3b8", "co-appearance": "#c4d0e4",
};
export function relType(t: string) {
  const l = (t || "").toLowerCase();
  for (const k of Object.keys(REL_COLORS)) if (l.includes(k.replace("-appearance", ""))) return k;
  if (/sister|brother|mother|father|son|daughter|aunt|uncle|cousin|wife|husband|niece|nephew|grand/.test(l)) return "family";
  if (/love|lover|romance|married|fianc/.test(l)) return "romantic";
  if (/friend/.test(l)) return "friendship";
  if (/rival/.test(l)) return "rivalry";
  if (/enem|antagon/.test(l)) return "enemy";
  if (/work|colleague|employ|boss|mentor|teacher/.test(l)) return "professional";
  return "other";
}

type Node = { id: string; label: string; weight: number; x: number; y: number; vx: number; vy: number };
type Edge = { a: string; b: string; type: string; label: string };

/** Interactive character relationship map (force-directed layout, no external libraries). */
export function RelationshipMap({ nodes: rawNodes, edges, onSelect, selected }: { nodes: { id: string; label: string; weight: number }[]; edges: Edge[]; onSelect: (id: string) => void; selected: string | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const [showCo, setShowCo] = useState(() => !edges.some((e) => e.type !== "co-appearance"));
  const W = 900,
    H = 560;
  const visibleEdges = edges.filter((e) => showCo || e.type !== "co-appearance");
  const layout = useMemo(() => {
    const ns: Node[] = rawNodes.map((n, i) => {
      const ang = (i / Math.max(1, rawNodes.length)) * Math.PI * 2;
      return { ...n, x: W / 2 + Math.cos(ang) * 220, y: H / 2 + Math.sin(ang) * 180, vx: 0, vy: 0 };
    });
    const idx = new Map(ns.map((n, i) => [n.id, i]));
    const es = visibleEdges.filter((e) => idx.has(e.a) && idx.has(e.b));
    for (let it = 0; it < 400; it++) {
      const alpha = 1 - it / 400;
      for (let i = 0; i < ns.length; i++)
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j];
          let dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 100);
          const f = (60000 / d2) * alpha;
          const d = Math.sqrt(d2);
          dx /= d; dy /= d;
          a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
        }
      for (const e of es) {
        const a = ns[idx.get(e.a)!], b = ns[idx.get(e.b)!];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 190) / d) * 0.03 * alpha;
        a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f;
      }
      for (const n of ns) {
        n.vx += (W / 2 - n.x) * 0.002; n.vy += (H / 2 - n.y) * 0.002;
        n.x += n.vx; n.y += n.vy; n.vx *= 0.6; n.vy *= 0.6;
        n.x = Math.max(60, Math.min(W - 60, n.x)); n.y = Math.max(40, Math.min(H - 40, n.y));
      }
    }
    return { ns, idx, es };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNodes, edges, showCo]);
  const maxW = Math.max(1, ...rawNodes.map((n) => n.weight));
  const focus = hover ?? selected;
  const linked = new Set(focus ? layout.es.filter((e) => e.a === focus || e.b === focus).flatMap((e) => [e.a, e.b]) : []);
  const types = [...new Set(layout.es.map((e) => e.type))];
  if (!rawNodes.length) return <p className="p-6 text-sm italic text-navy-400">No characters detected yet.</p>;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg bg-gradient-to-b from-white to-navy-50/40" role="img" aria-label="Character relationship map">
        {layout.es.map((e, i) => {
          const a = layout.ns[layout.idx.get(e.a)!], b = layout.ns[layout.idx.get(e.b)!];
          const dim = focus && !(e.a === focus || e.b === focus);
          return (
            <g key={i} opacity={dim ? 0.12 : 1}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={REL_COLORS[e.type]} strokeWidth={e.type === "co-appearance" ? 1 : 2} strokeDasharray={e.type === "co-appearance" ? "4 4" : undefined} />
              {focus && !dim && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} textAnchor="middle" className="fill-navy-600" style={{ fontSize: 11 }}>{e.label.slice(0, 40)}</text>}
            </g>
          );
        })}
        {layout.ns.map((n) => {
          const r = 10 + (n.weight / maxW) * 18;
          const dim = focus && focus !== n.id && !linked.has(n.id);
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.25 : 1} className="cursor-pointer" onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelect(n.id)}>
              <circle r={r} fill={selected === n.id ? "#c4933a" : "#1d2a46"} stroke="#dec174" strokeWidth={selected === n.id ? 3 : 1.5} />
              <text y={r + 14} textAnchor="middle" className="fill-navy-950 font-medium" style={{ fontSize: 12.5 }}>{n.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-navy-500">
        {types.map((t) => <span key={t} className="flex items-center gap-1"><span className="h-0.5 w-4" style={{ background: REL_COLORS[t] }} />{t}</span>)}
        <label className="ml-auto flex items-center gap-1"><input type="checkbox" checked={showCo} onChange={(e) => setShowCo(e.target.checked)} /> Show co-appearances</label>
      </div>
    </div>
  );
}
