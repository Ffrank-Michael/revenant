"use client";

import { useEffect, useState } from "react";
import { fmtElapsed, fmtElapsedShort } from "@/lib/format";

// Counts up from the moment Revenant saved its warning on Walrus.
// If the coin was pulled, the clock stops and shows the final gap between the warning and the pull.
// Only this tiny component re-renders each second.
export function WarnedClock({ warnedAt, pulledAt, className = "mt-3 font-mono text-sm leading-6 text-warn" }: { warnedAt: string; pulledAt: string | null; className?: string }) {
  const start = Date.parse(warnedAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (pulledAt) return; // stopped: nothing to count
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pulledAt]);

  if (pulledAt) {
    const gap = Date.parse(pulledAt) - start;
    return (
      <p className={className}>
        {gap >= 0 ? `We warned about this ${fmtElapsedShort(gap)} before it happened.` : `This was pulled ${fmtElapsedShort(-gap)} before we warned about it.`}
      </p>
    );
  }
  return (
    <p className={className} role="timer" aria-live="off">
      {now === null ? "We saved a warning about this." : `We warned about this ${fmtElapsed(now - start)} ago.`}
    </p>
  );
}
