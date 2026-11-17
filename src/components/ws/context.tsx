"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";

export type WS = { id: string; data: any | null; error: string | null; reload: () => Promise<void> };
const Ctx = createContext<WS | null>(null);

export function WorkspaceProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(async () => {
    try {
      const d = await api(`/api/manuscripts/${id}`);
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);
  useEffect(() => {
    reload();
  }, [reload]);
  // Poll while a job is running.
  useEffect(() => {
    const running = data?.job && ["queued", "running"].includes(data.job.status);
    if (timer.current) clearTimeout(timer.current);
    if (running) timer.current = setTimeout(reload, 2000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, reload]);
  return <Ctx.Provider value={{ id, data, error, reload }}>{children}</Ctx.Provider>;
}

export function useWS() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWS outside WorkspaceProvider");
  return c;
}
