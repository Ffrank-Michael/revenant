"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SearchBox } from "./SearchBox";
import { LoadingNotice } from "./LoadingNotice";
import { ErrorNotice } from "./ErrorNotice";
import { ResultCard } from "./ResultCard";
import { fetchTrace } from "@/lib/traceClient";
import type { TraceWithMemory } from "@/lib/rugs";

// The example coin used by the "Try a rug we caught" button.
const BUBBLES_COIN = "0x25607c967deeb5e22e48d275bd2af73eb147b57c67e679c8f42f6e925e767ee0::bubbles::BUBBLES";

type View =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "bad_input"; message: string }
  | { name: "retry"; message: string }
  | { name: "done"; data: TraceWithMemory };

// intro = heading and subtext, side = the compact chain. On desktop they sit in two columns split by a thin rule.
export function SearchPanel({ intro, side }: { intro: ReactNode; side: ReactNode }) {
  const [coin, setCoin] = useState("");
  const [view, setView] = useState<View>({ name: "idle" });
  const running = useRef<AbortController | null>(null);

  useEffect(() => () => running.current?.abort(), []); // leaving the page cancels the request

  const run = useCallback(async (value: string) => {
    running.current?.abort(); // a new search replaces an old one
    const ctl = new AbortController();
    running.current = ctl;
    setView({ name: "loading" });
    const out = await fetchTrace(value, ctl.signal);
    if (running.current !== ctl) return; // a newer search took over
    if (out.kind === "ok") setView({ name: "done", data: out.data });
    else if (out.kind === "bad_input") setView({ name: "bad_input", message: out.message });
    else if (out.kind === "retry") setView({ name: "retry", message: out.message });
    else setView({ name: "idle" }); // cancelled
  }, []);

  const loading = view.name === "loading";

  return (
    <section aria-labelledby="page-title" className="grid gap-6 lg:grid-cols-2 lg:gap-y-10">
      {/* left: heading, subtext, search box, buttons (and the loading or error notice) */}
      <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1 lg:pr-10">
        {intro}
        <SearchBox value={coin} onChange={setCoin} onSubmit={run} disabled={loading} />

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setCoin(BUBBLES_COIN);
              setView({ name: "idle" });
            }}
            className="w-full rounded-full border border-warn/50 px-4 py-3 text-center font-mono sm:w-auto sm:py-2 text-xs uppercase tracking-widest text-warn transition-colors hover:bg-warn hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-warn"
          >
            Try a rug we caught
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-dim">An example coin from the story below</span>
        </div>

        {view.name === "loading" && <LoadingNotice onCancel={() => running.current?.abort()} />}
        {view.name === "bad_input" && <ErrorNotice message={view.message} />}
        {view.name === "retry" && <ErrorNotice message={view.message} onRetry={() => run(coin.trim())} />}
      </div>

      {/* the result sits right under the search box on phones, and across the full width on desktop */}
      {view.name === "done" && (
        <div className="min-w-0 lg:col-span-2 lg:row-start-2">
          <ResultCard data={view.data} />
        </div>
      )}

      {/* right: the chain (under the search box on phones) */}
      <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:border-l lg:border-line lg:pl-10">{side}</div>
    </section>
  );
}
