"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { BoardData } from "@/lib/board";

// One read of the board data, shared by the chain at the top of the page and the cards further down.
export type Loaded = BoardData & { ok: true };
export type BoardState = { name: "loading" } | { name: "error" } | { name: "ready"; data: Loaded };

const Ctx = createContext<{ state: BoardState; reload: () => void }>({ state: { name: "loading" }, reload: () => {} });
export const useBoard = () => useContext(Ctx);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BoardState>({ name: "loading" });
  const load = useCallback(async () => {
    setState({ name: "loading" });
    try {
      const res = await fetch("/api/memory", { cache: "no-store", signal: AbortSignal.timeout(90_000) });
      const body = await res.json();
      if (!res.ok || !body?.ok) throw new Error("memory answer was not ok: " + res.status);
      setState({ name: "ready", data: body as Loaded });
    } catch (e) {
      console.error("[board] could not load the examples:", e);
      setState({ name: "error" });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return <Ctx.Provider value={{ state, reload: load }}>{children}</Ctx.Provider>;
}
