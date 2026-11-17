"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function doFetch(url: string, init: RequestInit): Promise<Response> {
  if (process.env.NEXT_PUBLIC_MOBILE === "1" && url.startsWith("/api/")) {
    const { localFetch } = await import("@/mobile/router");
    return localFetch(url, init);
  }
  return fetch(url, init);
}

/** Downloads a generated export. On the phone it is saved to Documents/Cashless Edit and the share sheet opens. */
export async function downloadExport(id: string) {
  if (process.env.NEXT_PUBLIC_MOBILE === "1") {
    const res = await doFetch(`/api/exports/${id}`, { method: "GET" });
    if (!res.ok) throw new ApiError((await res.json()).error ?? "Download failed", res.status);
    const name = decodeURIComponent(res.headers.get("X-File-Name") ?? "export");
    const ext = name.split(".").pop() ?? "";
    const mime = ext === "pdf" ? "application/pdf" : ext === "epub" ? "application/epub+zip" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const { saveAndShare } = await import("@/mobile/files");
    await saveAndShare(name, new Uint8Array(await res.arrayBuffer()), mime);
    return;
  }
  window.location.href = `/api/exports/${id}`;
}

export async function api<T = any>(url: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const res = await doFetch(url, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    signal: opts.signal,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status === 401 && typeof window !== "undefined" && process.env.NEXT_PUBLIC_MOBILE !== "1") {
    window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
  }
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

export function fmtDate(t: number | null | undefined) {
  if (!t) return "—";
  return new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
export function ago(t: number | null | undefined) {
  if (!t) return "—";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}
export function bytes(n: number) {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}
