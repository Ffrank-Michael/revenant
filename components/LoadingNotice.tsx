"use client";

import { useEffect, useState } from "react";

// What the trace is doing, in plain words. The server does not report live progress,
// so these lines follow the usual order of the work and are timed, not measured.
const STEPS = [
  { from: 0, text: "Finding who made the coin" },
  { from: 7, text: "Following where their first money came from" },
  { from: 18, text: "Checking the coin against past rug pulls" },
  { from: 40, text: "Still working. This one is taking a bit longer" },
];

export function LoadingNotice({ onCancel }: { onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const step = [...STEPS].reverse().find((s) => seconds >= s.from) ?? STEPS[0];

  return (
    <div role="status" aria-live="polite" className="rounded-2xl border border-line bg-paper p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warn opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-warn" />
        </span>
        <p className="font-mono text-xs uppercase tracking-widest text-warn">Tracing the money</p>
        <span className="ml-auto font-mono text-xs text-dim">{seconds}s</span>
      </div>
      <p className="mt-3 text-base text-text">{step.text}…</p>
      <p className="mt-1 text-sm leading-6 text-dim">This can take up to 30 seconds. Please keep this page open.</p>
      <button
        type="button"
        onClick={onCancel}
        className="mt-4 rounded-full border border-line px-4 py-2 font-mono text-xs uppercase tracking-widest text-dim transition-colors hover:border-text hover:text-text"
      >
        Cancel
      </button>
    </div>
  );
}
