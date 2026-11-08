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

// intro = heading and subtext. One column: intro, search box, button, then the result.
export function SearchPanel({ intro }: { intro: ReactNode }) {
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
    <section aria-labelledby="page-title" className="flex flex-col gap-6 pb-6 lg:pb-0">
      {intro}

      {/* search box, then 16 px, then the button */}
      <div className="flex flex-col gap-4">
        <SearchBox value={coin} onChange={setCoin} onSubmit={run} disabled={loading} />
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setCoin(BUBBLES_COIN);
            setView({ name: "idle" });
          }}
          className="w-full rounded-full border border-warn/50 px-4 py-3 text-center font-mono text-xs uppercase tracking-widest text-warn transition-colors hover:bg-warn hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-warn sm:w-auto sm:self-start sm:py-2"
        >
          Try a rug we caught
        </button>
        {view.name === "loading" && <LoadingNotice onCancel={() => running.current?.abort()} />}
        {view.name === "bad_input" && <ErrorNotice message={view.message} />}
        {view.name === "retry" && <ErrorNotice message={view.message} onRetry={() => run(coin.trim())} />}
      </div>

      {view.name === "done" && <ResultCard data={view.data} />}
    </section>
  );
}
