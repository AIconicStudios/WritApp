/**
 * In-app API: the phone runs the very same route handlers as the web server, called directly
 * (no network). Requests are matched to handlers here.
 */
type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Mod = Partial<Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE", Handler>>;

const routes: [RegExp, string[], () => Promise<Mod>][] = [
  [/^\/api\/settings\/ai\/test$/, [], () => import("@/app/api/settings/ai/test/route")],
  [/^\/api\/settings\/ai$/, [], () => import("@/app/api/settings/ai/route")],
  [/^\/api\/auth\/me$/, [], () => import("@/app/api/auth/me/route")],
  [/^\/api\/account$/, [], () => import("./routes/account")],
  [/^\/api\/exports\/([^/]+)$/, ["xid"], () => import("./routes/export-file")],
  [/^\/api\/exports$/, [], () => import("@/app/api/exports/route")],
  [/^\/api\/jobs\/([^/]+)$/, ["jobId"], () => import("@/app/api/jobs/[jobId]/route")],
  [/^\/api\/manuscripts$/, [], () => import("@/app/api/manuscripts/route")],
  [/^\/api\/manuscripts\/([^/]+)$/, ["id"], () => import("./routes/manuscript")],
  [/^\/api\/manuscripts\/([^/]+)\/jobs$/, ["id"], () => import("@/app/api/manuscripts/[id]/jobs/route")],
  [/^\/api\/manuscripts\/([^/]+)\/issues\/bulk$/, ["id"], () => import("@/app/api/manuscripts/[id]/issues/bulk/route")],
  [/^\/api\/manuscripts\/([^/]+)\/issues\/([^/]+)$/, ["id", "iid"], () => import("@/app/api/manuscripts/[id]/issues/[iid]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/issues$/, ["id"], () => import("@/app/api/manuscripts/[id]/issues/route")],
  [/^\/api\/manuscripts\/([^/]+)\/chapters\/([^/]+)$/, ["id", "cid"], () => import("@/app/api/manuscripts/[id]/chapters/[cid]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/paragraphs\/apply$/, ["id"], () => import("@/app/api/manuscripts/[id]/paragraphs/apply/route")],
  [/^\/api\/manuscripts\/([^/]+)\/paragraphs\/([^/]+)$/, ["id", "pid"], () => import("@/app/api/manuscripts/[id]/paragraphs/[pid]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/analysis\/([^/]+)$/, ["id", "kind"], () => import("@/app/api/manuscripts/[id]/analysis/[kind]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/intelligence$/, ["id"], () => import("@/app/api/manuscripts/[id]/intelligence/route")],
  [/^\/api\/manuscripts\/([^/]+)\/bible\/proposals$/, ["id"], () => import("@/app/api/manuscripts/[id]/bible/proposals/route")],
  [/^\/api\/manuscripts\/([^/]+)\/bible\/([^/]+)$/, ["id", "eid"], () => import("@/app/api/manuscripts/[id]/bible/[eid]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/bible$/, ["id"], () => import("@/app/api/manuscripts/[id]/bible/route")],
  [/^\/api\/manuscripts\/([^/]+)\/creative$/, ["id"], () => import("@/app/api/manuscripts/[id]/creative/route")],
  [/^\/api\/manuscripts\/([^/]+)\/drafts\/([^/]+)$/, ["id", "did"], () => import("@/app/api/manuscripts/[id]/drafts/[did]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/drafts$/, ["id"], () => import("@/app/api/manuscripts/[id]/drafts/route")],
  [/^\/api\/manuscripts\/([^/]+)\/branches\/([^/]+)$/, ["id", "bid"], () => import("@/app/api/manuscripts/[id]/branches/[bid]/route")],
  [/^\/api\/manuscripts\/([^/]+)\/branches$/, ["id"], () => import("@/app/api/manuscripts/[id]/branches/route")],
  [/^\/api\/manuscripts\/([^/]+)\/rewrite$/, ["id"], () => import("@/app/api/manuscripts/[id]/rewrite/route")],
  [/^\/api\/manuscripts\/([^/]+)\/versions$/, ["id"], () => import("@/app/api/manuscripts/[id]/versions/route")],
  [/^\/api\/manuscripts\/([^/]+)\/exports$/, ["id"], () => import("@/app/api/manuscripts/[id]/exports/route")],
  [/^\/api\/manuscripts\/([^/]+)\/search$/, ["id"], () => import("@/app/api/manuscripts/[id]/search/route")],
];

export async function localFetch(url: string, init: RequestInit): Promise<Response> {
  await (await import("./boot")).ready();
  const u = new URL(url, "http://local");
  for (const [re, names, load] of routes) {
    const m = u.pathname.match(re);
    if (!m) continue;
    const mod = await load();
    const method = (init.method ?? "GET").toUpperCase() as keyof Mod;
    const h = mod[method];
    if (!h) return Response.json({ error: "Method not allowed" }, { status: 405 });
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    return h(new Request(u.toString(), init), { params: Promise.resolve(params) });
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
