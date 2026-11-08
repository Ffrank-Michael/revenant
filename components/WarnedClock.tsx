"use client";

import { useEffect, useState } from "react";
import { fmtElapsed } from "@/lib/format";

// Counts up from the moment Revenant saved its warning on Walrus.
// If the coin was pulled, the clock stops and shows the final gap between warning and pull.
// Only this tiny component re-renders each second.
export function WarnedClock({ warnedAt, pulledAt }: { warnedAt: string; pulledAt: string | null }) {
  const start = Date.parse(warnedAt);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (pulledAt) return; // frozen: nothing to tick
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pulledAt]);

  if (pulledAt) {
    const gap = Date.parse(pulledAt) - start;
    return (
      <p className="mt-3 font-mono text-xs leading-5 text-warn">
        {gap >= 0 ? `Warned ${fmtElapsed(gap)} before the pull.` : `Pulled ${fmtElapsed(-gap)} before the warning.`}
      </p>
    );
  }
  return (
    <p className="mt-3 font-mono text-xs leading-5 text-warn" role="timer" aria-live="off">
      {now === null ? "Warning saved on Walrus." : `Warned ${fmtElapsed(now - start)} ago. Not pulled yet.`}
    </p>
  );
}
